-- MyB · 0002 — profiles, roles, devices
-- FR-AUTH-1/2/4: email+phone auth, Worker/Customer/SME roles (worker+customer may coexist).

create table public.profiles (
  id                uuid primary key references auth.users (id) on delete cascade,
  full_name         text not null default '',
  avatar_url        text,
  phone             text,
  phone_verified    boolean not null default false,
  -- A user can hold Worker and Customer simultaneously (FR-AUTH-2).
  is_worker         boolean not null default false,
  is_customer       boolean not null default true,
  is_sme            boolean not null default false,
  is_admin          boolean not null default false,
  -- Identity verification gate (FR-AUTH-3); set by the verification pipeline only.
  identity_verified boolean not null default false,
  -- TRN: format-validated only for MVP (FR-VER-7); registry check is ROADMAP.
  trn               text check (trn is null or trn ~ '^[0-9]{9}$'),
  country           text not null default 'JM',
  parish            text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Auto-create a profile row on signup.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Admin check used across policies. SECURITY DEFINER avoids recursive RLS.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((select p.is_admin from public.profiles p where p.id = auth.uid()), false);
$$;

alter table public.profiles enable row level security;

create policy "profiles: read own"
  on public.profiles for select
  to authenticated
  using (id = auth.uid() or public.is_admin());

create policy "profiles: update own"
  on public.profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- Trust fields (verified flags, admin) are set only by server-side pipelines.
-- Column-level grants keep them out of client reach even with the row policy open.
revoke update on public.profiles from authenticated, anon;
grant update (full_name, avatar_url, phone, is_worker, is_customer, is_sme, trn, country, parish)
  on public.profiles to authenticated;

-- Device fingerprints power the duplicate-account fraud heuristic (FR-REP-4).
-- The app submits an opaque hash (installation id + salted device info) — no PII.
create table public.device_fingerprints (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.profiles (id) on delete cascade,
  fingerprint_hash text not null,
  platform         text,
  last_seen_at     timestamptz not null default now(),
  unique (user_id, fingerprint_hash)
);

create index device_fingerprints_hash_idx on public.device_fingerprints (fingerprint_hash);

alter table public.device_fingerprints enable row level security;

create policy "devices: insert own"
  on public.device_fingerprints for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "devices: update own"
  on public.device_fingerprints for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "devices: admin read"
  on public.device_fingerprints for select
  to authenticated
  using (user_id = auth.uid() or public.is_admin());
