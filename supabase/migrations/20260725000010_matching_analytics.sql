-- MyB · 0010 — rules-based matching + analytics events
-- FR-DISC-3/4/6/7, FR-ANL-1. Matching is a DETERMINISTIC weighted score — the
-- LLM only extracts intent (language), it never ranks (decisions). No ML here.

-- Analytics events (FR-ANL-1): labour-market insight raw material.
-- Aggregated + anonymized before any secondary use (SR-19).
create table public.events (
  id         bigint generated always as identity primary key,
  user_id    uuid references public.profiles (id) on delete set null,
  event_type text not null,
  trade_slug text,
  parish     text,
  payload    jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index events_type_idx on public.events (event_type, created_at desc);
create index events_trade_parish_idx on public.events (trade_slug, parish);

alter table public.events enable row level security;

create policy "events: insert own"
  on public.events for insert
  to authenticated
  with check (user_id = auth.uid() or user_id is null);

create policy "events: admin read"
  on public.events for select
  to authenticated
  using (public.is_admin());

-- ─────────────────────────────────────────────────────────────────────────────
-- match_workers: the core discovery ranking (FR-DISC-3).
--   0.35 semantic skill relevance   (pgvector cosine vs service descriptions)
--   0.25 geographic proximity      (PostGIS ST_Distance, 30 km soft horizon)
--   0.20 reputation                (computed score / 100)
--   0.10 availability              (binary for MVP)
--   0.10 job-completion history    (saturates at 20 jobs)
-- Weights documented in app_config('matching_weights'); keep both in sync.
-- SECURITY DEFINER + explicit visible/identity filters (discovery is public data).
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.match_workers(
  p_embedding  vector(768) default null,
  p_lat        double precision default null,
  p_lng        double precision default null,
  p_trade_slug text default null,
  p_parish     text default null,
  p_min_rating numeric default null,
  p_limit      int default 20
)
returns table (
  worker_id        uuid,
  full_name        text,
  avatar_url       text,
  headline         text,
  parish           text,
  trade_slug       text,
  service_title    text,
  rate_min_jmd     numeric,
  rate_max_jmd     numeric,
  rate_unit        text,
  reputation       numeric,
  rating_avg       numeric,
  rating_count     int,
  jobs_completed   int,
  identity_verified boolean,
  tier_skill       boolean,
  tier_business    boolean,
  available        boolean,
  distance_km      numeric,
  similarity       numeric,
  match_score      numeric
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with candidates as (
    select
      wp.user_id,
      p.full_name,
      p.avatar_url,
      wp.headline,
      wp.parish,
      sd.trade_slug,
      sd.title as service_title,
      wp.rate_min_jmd,
      wp.rate_max_jmd,
      wp.rate_unit,
      wp.reputation,
      wp.rating_avg,
      wp.rating_count,
      wp.jobs_completed,
      p.identity_verified,
      wp.tier_skill,
      wp.tier_business,
      wp.available,
      case
        when p_lat is not null and p_lng is not null and wp.location is not null
        then st_distance(wp.location,
                         st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography) / 1000.0
      end as distance_km,
      case
        when p_embedding is not null and sd.embedding is not null
        then 1 - (sd.embedding <=> p_embedding)
      end as similarity,
      -- Rank each worker by their single best-matching service.
      row_number() over (
        partition by wp.user_id
        order by case
          when p_embedding is not null and sd.embedding is not null
          then sd.embedding <=> p_embedding else 1 end
      ) as service_rank
    from public.worker_profiles wp
    join public.profiles p on p.id = wp.user_id
    join public.service_descriptions sd on sd.user_id = wp.user_id
    where wp.visible = true
      and (p_trade_slug is null or sd.trade_slug = p_trade_slug)
      and (p_parish is null or wp.parish = p_parish)
      and (p_min_rating is null or wp.rating_avg >= p_min_rating)
  )
  select
    c.user_id,
    c.full_name,
    c.avatar_url,
    c.headline,
    c.parish,
    c.trade_slug,
    c.service_title,
    c.rate_min_jmd,
    c.rate_max_jmd,
    c.rate_unit,
    c.reputation,
    c.rating_avg,
    c.rating_count,
    c.jobs_completed,
    c.identity_verified,
    c.tier_skill,
    c.tier_business,
    c.available,
    round(c.distance_km::numeric, 1),
    round(c.similarity::numeric, 4),
    round((
      0.35 * coalesce(c.similarity, 0.5)
      + 0.25 * coalesce(1 - least(c.distance_km, 30) / 30.0, 0.5)
      + 0.20 * (c.reputation / 100.0)
      + 0.10 * (case when c.available then 1 else 0 end)
      + 0.10 * least(c.jobs_completed, 20) / 20.0
    )::numeric, 4) as match_score
  from candidates c
  where c.service_rank = 1
  order by match_score desc
  limit greatest(1, least(p_limit, 50));
$$;

-- Local demand insights for workers (FR-DISC-7): job volume by trade in a parish
-- over the last 30 days. Aggregated — no customer identities exposed.
create or replace function public.get_demand_insights(p_parish text default null)
returns table (trade_slug text, trade_label text, job_count bigint, avg_budget_jmd numeric)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select j.trade_slug,
         t.label,
         count(*) as job_count,
         round(avg((coalesce(j.budget_min_jmd, 0) + coalesce(j.budget_max_jmd, j.budget_min_jmd, 0)) / 2), 0)
    from public.jobs j
    join public.trades t on t.slug = j.trade_slug
   where j.created_at > now() - interval '30 days'
     and (p_parish is null or j.parish = p_parish)
   group by j.trade_slug, t.label
   order by job_count desc
   limit 10;
$$;
