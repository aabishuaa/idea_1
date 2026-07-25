-- MyB · 0003 — reference tables, worker profiles, service descriptions, portfolio, storage
-- FR-PROF-1..5. Embeddings are 768-dim (Gemini text-embedding-004).

-- Reference: Jamaican parishes (country-tagged so CARICOM expansion is data, not code — SR-9).
create table public.parishes (
  id       serial primary key,
  country  text not null default 'JM',
  name     text not null,
  centroid geography(point, 4326) not null,
  unique (country, name)
);

alter table public.parishes enable row level security;
create policy "parishes: public read" on public.parishes for select using (true);

-- Reference: trades.
create table public.trades (
  id    serial primary key,
  slug  text not null unique,
  label text not null,
  emoji text not null default '🛠️'
);

alter table public.trades enable row level security;
create policy "trades: public read" on public.trades for select using (true);

-- Worker profile (one per user who opts into the Worker role).
create table public.worker_profiles (
  user_id             uuid primary key references public.profiles (id) on delete cascade,
  headline            text not null default '',
  bio                 text not null default '',
  parish              text not null default 'Kingston',
  location            geography(point, 4326),
  years_experience    int not null default 0 check (years_experience between 0 and 80),
  rate_min_jmd        numeric(12,2),
  rate_max_jmd        numeric(12,2),
  rate_unit           text not null default 'hour' check (rate_unit in ('hour', 'day', 'job')),
  available           boolean not null default true,
  availability_note   text,
  -- Discoverability beyond the immediate community (FR-PROF-5).
  visible             boolean not null default true,
  -- Progressive verification tiers (FR-VER-6). Identity lives on profiles;
  -- these unlock additional visibility. Set by server-side flows only.
  tier_phone          boolean not null default false,
  tier_skill          boolean not null default false,
  tier_business       boolean not null default false,
  -- Cached reputation (denormalized from reputation_scores for cheap ranking).
  reputation          numeric(5,2) not null default 0,
  rating_avg          numeric(3,2) not null default 0,
  rating_count        int not null default 0,
  jobs_completed      int not null default 0,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index worker_profiles_location_idx on public.worker_profiles using gist (location);
create index worker_profiles_parish_idx on public.worker_profiles (parish);

create trigger worker_profiles_updated_at
  before update on public.worker_profiles
  for each row execute function public.set_updated_at();

alter table public.worker_profiles enable row level security;

-- Discovery is the product: any signed-in user can view visible worker profiles (FR-PROF-3).
create policy "worker_profiles: read visible or own"
  on public.worker_profiles for select
  to authenticated
  using (visible = true or user_id = auth.uid() or public.is_admin());

create policy "worker_profiles: insert own"
  on public.worker_profiles for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "worker_profiles: update own"
  on public.worker_profiles for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Tier + reputation columns are computed server-side; column grants enforce it.
revoke update on public.worker_profiles from authenticated, anon;
grant update (headline, bio, parish, location, years_experience, rate_min_jmd,
              rate_max_jmd, rate_unit, available, availability_note, visible)
  on public.worker_profiles to authenticated;

-- A worker's offered services; each description is embedded for semantic matching
-- (FR-PROF-4, FR-DISC-4). Embedding is written by the embed-text edge function.
create table public.service_descriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.worker_profiles (user_id) on delete cascade,
  trade_slug  text not null references public.trades (slug),
  title       text not null,
  description text not null,
  embedding   vector(768),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index service_descriptions_user_idx on public.service_descriptions (user_id);
create index service_descriptions_trade_idx on public.service_descriptions (trade_slug);
-- ivfflat is fine at MVP scale; revisit lists as row count grows.
create index service_descriptions_embedding_idx on public.service_descriptions
  using ivfflat (embedding vector_cosine_ops) with (lists = 100);

create trigger service_descriptions_updated_at
  before update on public.service_descriptions
  for each row execute function public.set_updated_at();

alter table public.service_descriptions enable row level security;

create policy "services: read all"
  on public.service_descriptions for select
  to authenticated
  using (true);

create policy "services: manage own"
  on public.service_descriptions for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "services: update own"
  on public.service_descriptions for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "services: delete own"
  on public.service_descriptions for delete
  to authenticated
  using (user_id = auth.uid());

-- Embeddings are computed server-side (embed-text edge function). Clients
-- must not write arbitrary vectors to game semantic ranking.
revoke insert, update on public.service_descriptions from authenticated, anon;
grant insert (user_id, trade_slug, title, description)
  on public.service_descriptions to authenticated;
grant update (trade_slug, title, description)
  on public.service_descriptions to authenticated;

-- Portfolio images (FR-PROF-2) — files live in the public 'portfolios' bucket.
create table public.portfolio_items (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.worker_profiles (user_id) on delete cascade,
  storage_path text not null,
  caption      text not null default '',
  created_at   timestamptz not null default now()
);

alter table public.portfolio_items enable row level security;

create policy "portfolio: read all"
  on public.portfolio_items for select
  to authenticated
  using (true);

create policy "portfolio: manage own"
  on public.portfolio_items for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "portfolio: delete own"
  on public.portfolio_items for delete
  to authenticated
  using (user_id = auth.uid());

-- Storage buckets ---------------------------------------------------------------
-- portfolios: public-read work photos. id-documents: private, verification only
-- (SR-17: embeddings preferred; raw ID images are transient and access-restricted).
insert into storage.buckets (id, name, public)
values ('portfolios', 'portfolios', true), ('id-documents', 'id-documents', false)
on conflict (id) do nothing;

create policy "storage portfolios: public read"
  on storage.objects for select
  using (bucket_id = 'portfolios');

create policy "storage portfolios: owner write"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'portfolios' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "storage portfolios: owner delete"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'portfolios' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "storage id-documents: owner write"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'id-documents' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "storage id-documents: owner read"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'id-documents' and (storage.foldername(name))[1] = auth.uid()::text);
