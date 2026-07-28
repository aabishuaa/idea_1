-- MyB · 0018 — fix "permission denied" on saving a worker profile / starting verification
--
-- THE BUG
-- 0003 and 0006 lock down who may write which columns with column-level grants
-- (so a client can never set reputation, tiers, or the face embedding). That is
-- right, and it stays.
--
-- What broke is the CLIENT pattern: PostgREST's upsert compiles to
--   insert ... on conflict (user_id) do update set <every column in the payload>
-- and that payload always includes the conflict key itself. `user_id` is not in
-- the UPDATE grant — deliberately, since nobody should be able to reassign a
-- row to another user — so Postgres refused the whole statement with
-- "permission denied for table worker_profiles". Same for verification_records,
-- which is why verification could not be started either.
--
-- THE FIX
-- Give the app narrow SECURITY DEFINER entry points instead of raw upserts.
-- Each one writes only its own row (auth.uid()), so the column grants can stay
-- exactly as restrictive as they are.

-- ── Save a worker profile (+ its primary service) in one call ───────────────
create or replace function public.save_worker_profile(
  p_headline        text,
  p_bio             text,
  p_parish          text,
  p_years           int,
  p_rate_min        numeric,
  p_rate_max        numeric,
  p_rate_unit       text,
  p_available       boolean,
  p_visible         boolean default true,
  p_trade_slug      text default null,
  p_service_title   text default null,
  p_service_desc    text default null,
  p_service_id      uuid default null
)
returns table (service_id uuid)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_service uuid;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;

  insert into public.worker_profiles
    (user_id, headline, bio, parish, years_experience,
     rate_min_jmd, rate_max_jmd, rate_unit, available, visible)
  values
    (v_user, coalesce(p_headline, ''), coalesce(p_bio, ''), coalesce(p_parish, 'Kingston'),
     greatest(0, least(80, coalesce(p_years, 0))),
     p_rate_min, p_rate_max, coalesce(p_rate_unit, 'hour'),
     coalesce(p_available, true), coalesce(p_visible, true))
  on conflict (user_id) do update
    set headline         = excluded.headline,
        bio              = excluded.bio,
        parish           = excluded.parish,
        years_experience = excluded.years_experience,
        rate_min_jmd     = excluded.rate_min_jmd,
        rate_max_jmd     = excluded.rate_max_jmd,
        rate_unit        = excluded.rate_unit,
        available        = excluded.available,
        visible          = excluded.visible;

  -- The user is a worker from this point on.
  update public.profiles set is_worker = true where id = v_user;

  -- Primary service listing, if one was supplied.
  if p_trade_slug is not null and coalesce(p_service_title, '') <> '' then
    if p_service_id is not null then
      update public.service_descriptions
         set trade_slug  = p_trade_slug,
             title       = p_service_title,
             description = coalesce(p_service_desc, '')
       where id = p_service_id and user_id = v_user
      returning id into v_service;
    end if;

    if v_service is null then
      insert into public.service_descriptions (user_id, trade_slug, title, description)
      values (v_user, p_trade_slug, p_service_title, coalesce(p_service_desc, ''))
      returning id into v_service;
    end if;
  end if;

  return query select v_service;
end;
$$;

revoke execute on function public.save_worker_profile from public, anon;
grant execute on function public.save_worker_profile to authenticated;

-- ── Verification: consent, and recording that the ID step is done ──────────
create or replace function public.start_verification(p_consent_version text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;

  insert into public.verification_records
    (user_id, status, consent_given_at, consent_text_version)
  values (v_user, 'consented', now(), p_consent_version)
  on conflict (user_id) do update
    set status               = 'consented',
        consent_given_at     = now(),
        consent_text_version = excluded.consent_text_version;
end;
$$;

revoke execute on function public.start_verification from public, anon;
grant execute on function public.start_verification to authenticated;

-- Marks the ID step complete. The face embedding is still written ONLY by the
-- AI service with the service role — this records progress, nothing biometric.
create or replace function public.record_id_captured()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;

  insert into public.verification_records (user_id, status, id_captured_at, consent_given_at)
  values (v_user, 'id_captured', now(), now())
  on conflict (user_id) do update
    set status         = 'id_captured',
        id_captured_at = now();
end;
$$;

revoke execute on function public.record_id_captured from public, anon;
grant execute on function public.record_id_captured to authenticated;

-- ── Portfolio: add and remove your own work photos ─────────────────────────
create or replace function public.add_portfolio_item(p_path text, p_caption text default '')
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_id uuid;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;
  insert into public.portfolio_items (user_id, storage_path, caption)
  values (v_user, p_path, coalesce(p_caption, ''))
  returning id into v_id;
  return v_id;
end;
$$;

revoke execute on function public.add_portfolio_item from public, anon;
grant execute on function public.add_portfolio_item to authenticated;

-- ── Job requests a worker still has to answer ──────────────────────────────
-- Powers the "new requests" section on the worker's bookings screen: the
-- customer's name comes back with the job so the worker can decide.
create or replace function public.get_incoming_requests()
returns table (
  id             uuid,
  title          text,
  description    text,
  trade_slug     text,
  parish         text,
  urgency        public.job_urgency,
  budget_min_jmd numeric,
  budget_max_jmd numeric,
  requested_at   timestamptz,
  customer_id    uuid,
  customer_name  text,
  customer_avatar text,
  customer_verified boolean
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select j.id, j.title, j.description, j.trade_slug, j.parish, j.urgency,
         j.budget_min_jmd, j.budget_max_jmd, j.requested_at,
         p.id, p.full_name, p.avatar_url, p.identity_verified
    from public.jobs j
    join public.profiles p on p.id = j.customer_id
   where j.worker_id = auth.uid()
     and j.status = 'requested'
   order by j.requested_at desc;
$$;

revoke execute on function public.get_incoming_requests from public, anon;
grant execute on function public.get_incoming_requests to authenticated;
