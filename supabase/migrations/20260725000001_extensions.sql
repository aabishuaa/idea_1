-- MyB · 0001 — extensions + shared helpers
-- PostGIS for geographic proximity, pgvector for embeddings (DR-2, DR-3).

create extension if not exists postgis;
create extension if not exists vector;
create extension if not exists pgcrypto;

-- Shared updated_at maintenance -------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Key/value config for deterministic thresholds (SR-23: tunable without code).
create table public.app_config (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.app_config enable row level security;

-- Everyone signed in may read config; only service role / admins may write.
create policy "app_config readable by authenticated"
  on public.app_config for select
  to authenticated
  using (true);

insert into public.app_config (key, value) values
  -- Formalization auto-suggest thresholds (FR-BIZ-6). Deterministic, never LLM.
  ('formalization_suggest', '{"min_completed_jobs": 10, "min_avg_rating": 4.5, "min_active_weeks": 4}'),
  -- Fraud heuristic thresholds (FR-REP-4).
  ('fraud_heuristics', '{"review_velocity_per_day": 5, "min_reviews_for_pattern": 5, "pattern_stddev_below": 0.30, "max_reviews_per_device": 3}'),
  -- Matching weights (FR-DISC-3) — documented here; applied in match_workers().
  ('matching_weights', '{"semantic": 0.35, "proximity": 0.25, "reputation": 0.20, "availability": 0.10, "history": 0.10}');
