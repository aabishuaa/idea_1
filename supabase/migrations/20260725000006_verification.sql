-- MyB · 0006 — identity verification pipeline + progressive tiers
-- FR-VER-1..7. Two SEPARATE gates: liveness (on-device, proves a live human) and
-- face match (server, proves same person as ID). Never merged.
-- DPA: embeddings preferred over raw images (SR-17); explicit consent (SR-16);
-- sensitive columns locked down via RLS + column grants (DR-4).

create type public.verification_status as enum
  ('unstarted', 'consented', 'id_captured', 'liveness_passed', 'verified', 'failed');

create table public.verification_records (
  user_id            uuid primary key references public.profiles (id) on delete cascade,
  status             public.verification_status not null default 'unstarted',
  -- Gate 0: explicit consent BEFORE any capture (SR-16).
  consent_given_at   timestamptz,
  consent_text_version text,
  -- Gate 1 (ID): embedding of the face cropped from the government ID.
  -- Written ONLY by the AI service (service role). ArcFace → 512 dims.
  id_embedding       vector(512),
  id_image_path      text,          -- transient path in the private 'id-documents' bucket
  id_captured_at     timestamptz,
  -- Gate 2 (liveness): evaluated ON-DEVICE via ML Kit signals (SR-5).
  -- The app records the outcome + signal summary (head Euler-Y swing, blink).
  liveness_passed    boolean not null default false,
  liveness_at        timestamptz,
  liveness_metadata  jsonb not null default '{}',
  -- Gate 3 (match): cosine similarity selfie↔ID computed by the AI service.
  face_match_score   numeric(5,4),
  face_match_passed  boolean,
  face_matched_at    timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create trigger verification_records_updated_at
  before update on public.verification_records
  for each row execute function public.set_updated_at();

alter table public.verification_records enable row level security;

create policy "verification: read own"
  on public.verification_records for select
  to authenticated
  using (user_id = auth.uid() or public.is_admin());

create policy "verification: create own"
  on public.verification_records for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "verification: update own"
  on public.verification_records for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- The client may record consent, its on-device liveness outcome, and the
-- cosmetic step status — nothing else. Embeddings and match results are
-- server-side only. NOTE: `status` here is UI progress state; the authoritative
-- trust gate is profiles.identity_verified, set exclusively by
-- finalize_identity_verification (service role).
revoke update on public.verification_records from authenticated, anon;
grant update (status, consent_given_at, consent_text_version, liveness_passed, liveness_at, liveness_metadata)
  on public.verification_records to authenticated;
revoke insert on public.verification_records from authenticated, anon;
grant insert (user_id, status, consent_given_at, consent_text_version)
  on public.verification_records to authenticated;
-- Biometric embedding never leaves the server (defence in depth: also excluded from reads).
revoke select on public.verification_records from authenticated, anon;
grant select (user_id, status, consent_given_at, consent_text_version, id_captured_at,
              liveness_passed, liveness_at, face_match_score, face_match_passed,
              face_matched_at, created_at, updated_at)
  on public.verification_records to authenticated;

-- Called by the AI service (service role) after computing the selfie↔ID cosine
-- similarity. Grants the verified tier only when BOTH gates passed (FR-VER-5).
create or replace function public.finalize_identity_verification(
  p_user uuid, p_score numeric, p_passed boolean
)
returns public.verification_status
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_liveness boolean;
  v_status   public.verification_status;
begin
  select liveness_passed into v_liveness
    from public.verification_records where user_id = p_user;

  if v_liveness is null then
    raise exception 'no verification record for user %', p_user;
  end if;

  v_status := case when p_passed and v_liveness then 'verified'::public.verification_status
                   else 'failed'::public.verification_status end;

  update public.verification_records
     set face_match_score = p_score,
         face_match_passed = p_passed,
         face_matched_at = now(),
         status = v_status,
         -- DPA minimization: drop the raw ID image pointer once matched.
         id_image_path = case when p_passed then null else id_image_path end
   where user_id = p_user;

  update public.profiles
     set identity_verified = (v_status = 'verified')
   where id = p_user;

  return v_status;
end;
$$;

-- Only the service role may call this.
revoke execute on function public.finalize_identity_verification from public, anon, authenticated;
grant execute on function public.finalize_identity_verification to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- Progressive tiers (FR-VER-6): identity → phone → skill → business.
-- Deterministic thresholds; recomputed alongside reputation.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.refresh_worker_tiers(p_worker uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.worker_profiles wp
     set tier_phone = coalesce((select p.phone_verified from public.profiles p where p.id = p_worker), false),
         tier_skill = (wp.jobs_completed >= 5 and wp.rating_avg >= 4.0)
   where wp.user_id = p_worker;
  -- tier_business is set by the formalization pathway (0007).
end;
$$;

create or replace function public.on_reputation_score_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.refresh_worker_tiers(new.worker_id);
  return new;
end;
$$;

create trigger reputation_refresh_tiers
  after insert or update on public.reputation_scores
  for each row execute function public.on_reputation_score_change();

-- Phone tier: the client calls this after completing phone OTP; it checks
-- auth.users server-side rather than trusting the client (SR-12).
create or replace function public.refresh_phone_verification()
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_confirmed boolean;
begin
  select (phone_confirmed_at is not null) into v_confirmed
    from auth.users where id = auth.uid();

  update public.profiles set phone_verified = coalesce(v_confirmed, false) where id = auth.uid();
  update public.worker_profiles set tier_phone = coalesce(v_confirmed, false) where user_id = auth.uid();
  return coalesce(v_confirmed, false);
end;
$$;
