-- MyB · migration verification harness
--
-- The free tier gives us one database and no staging environment, and CI has no
-- Docker, so `supabase start` is not available. This file stands up just enough
-- of Supabase on a bare PostgreSQL 16 for every migration to be applied to a
-- from-scratch database and have its behaviour asserted — RLS isolation,
-- cascade deletes, permission refusals, retrieval quality — before it goes
-- anywhere near the live project.
--
-- Run it BEFORE the migrations:
--
--   psql -f supabase/test/harness.sql
--   for f in supabase/migrations/*.sql; do psql -v ON_ERROR_STOP=1 -f "$f"; done
--
-- It emulates the platform, not the product: anything defined here is a stand-in
-- for something Supabase provides, and no migration may depend on the details.

-- ── Extensions ───────────────────────────────────────────────────────────────
create extension if not exists pgcrypto;
create extension if not exists postgis;
create extension if not exists vector;
create extension if not exists pg_trgm;

-- ── Roles ────────────────────────────────────────────────────────────────────
-- Supabase ships these; a bare cluster does not. `nologin` because the harness
-- reaches them with SET ROLE rather than by connecting.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end $$;

grant usage on schema public to anon, authenticated, service_role;

-- Migrations assume the platform's default grants on newly created objects.
alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public
  grant select on tables to anon;
alter default privileges in schema public
  grant usage, select on sequences to authenticated, anon;

-- ── auth schema ──────────────────────────────────────────────────────────────
create schema if not exists auth;
grant usage on schema auth to anon, authenticated, service_role;

-- Only the columns the migrations actually reference.
create table if not exists auth.users (
  id         uuid primary key default gen_random_uuid(),
  email      text unique,
  phone      text,
  raw_user_meta_data jsonb not null default '{}',
  created_at timestamptz not null default now()
);

/*
  auth.uid() reads the request JWT on Supabase. Here it reads a session GUC the
  tests set, which is what lets a test become a specific user:

    set local role authenticated;
    set local request.jwt.claim.sub = '<uuid>';

  Returning NULL when unset matters — several policies and RPCs are expected to
  refuse an anonymous caller, and that path has to be reachable.
*/
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

create or replace function auth.role()
returns text
language sql
stable
as $$
  select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), current_user);
$$;

create or replace function auth.email()
returns text
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.email', true), '');
$$;

grant execute on function auth.uid(), auth.role(), auth.email()
  to anon, authenticated, service_role;

-- ── storage schema ───────────────────────────────────────────────────────────
create schema if not exists storage;
grant usage on schema storage to anon, authenticated, service_role;

create table if not exists storage.buckets (
  id                 text primary key,
  name               text not null,
  public             boolean not null default false,
  file_size_limit    bigint,
  allowed_mime_types text[],
  created_at         timestamptz not null default now()
);

create table if not exists storage.objects (
  id         uuid primary key default gen_random_uuid(),
  bucket_id  text references storage.buckets (id) on delete cascade,
  name       text not null,
  owner      uuid,
  metadata   jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table storage.objects enable row level security;
grant select, insert, update, delete on storage.objects to authenticated;
grant select on storage.objects to anon;
grant select, insert on storage.buckets to authenticated, service_role;

/*
  storage.foldername('a/b/c.jpg') -> {a,b}. The storage policies key on
  (storage.foldername(name))[1] to scope an object to its owner or its job, so
  this has to match the platform's semantics exactly: the FILE is dropped and
  only the directory parts are returned.
*/
create or replace function storage.foldername(name text)
returns text[]
language sql
immutable
as $$
  select case
    when name is null or position('/' in name) = 0 then '{}'::text[]
    else (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1]
  end;
$$;

create or replace function storage.filename(name text)
returns text
language sql
immutable
as $$
  select (string_to_array(name, '/'))[array_length(string_to_array(name, '/'), 1)];
$$;

grant execute on function storage.foldername(text), storage.filename(text)
  to anon, authenticated, service_role;

-- ── Realtime ─────────────────────────────────────────────────────────────────
-- Migration 0019 publishes tables into this. Supabase creates it at project
-- setup; creating it empty here lets `alter publication … add table` succeed.
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end $$;

-- ── Test helper ──────────────────────────────────────────────────────────────
/*
  Create an auth user + let the profiles trigger build the profile row.
  Returns the id so a test can immediately act as them.
*/
create or replace function public.harness_new_user(
  p_email text,
  p_name  text default 'Test User'
)
returns uuid
language plpgsql
as $$
declare
  v_id uuid := gen_random_uuid();
begin
  insert into auth.users (id, email, raw_user_meta_data)
  values (v_id, p_email, jsonb_build_object('full_name', p_name));
  return v_id;
end;
$$;
