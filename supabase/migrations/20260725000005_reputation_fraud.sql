-- MyB · 0005 — reputation intelligence + heuristic fraud checks
-- FR-REP-1..5. The score is a computed Postgres function — never AI (SR-23).
-- It is portable and worker-owned: framed as alternative credit data.

create table public.reputation_scores (
  worker_id      uuid primary key references public.worker_profiles (user_id) on delete cascade,
  score          numeric(5,2) not null default 0,   -- 0..100
  components     jsonb not null default '{}',       -- transparent breakdown
  calculated_at  timestamptz not null default now()
);

alter table public.reputation_scores enable row level security;

-- The score is public trust data (shown on profiles), and the worker owns it.
create policy "reputation: read all"
  on public.reputation_scores for select
  to authenticated
  using (true);

create table public.fraud_flags (
  id         uuid primary key default gen_random_uuid(),
  worker_id  uuid not null references public.worker_profiles (user_id) on delete cascade,
  flag_type  text not null check (flag_type in ('review_velocity', 'device_overlap', 'rating_pattern')),
  severity   text not null default 'medium' check (severity in ('low', 'medium', 'high')),
  evidence   jsonb not null default '{}',
  status     text not null default 'open' check (status in ('open', 'reviewed', 'cleared')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  unique (worker_id, flag_type, status)
);

alter table public.fraud_flags enable row level security;

-- Admin-only (FR-ADM-2): flags must not tip off the flagged account.
create policy "fraud_flags: admin read"
  on public.fraud_flags for select
  to authenticated
  using (public.is_admin());

create policy "fraud_flags: admin update"
  on public.fraud_flags for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ─────────────────────────────────────────────────────────────────────────────
-- Reputation: blend of review average, completion rate, response-time
-- consistency, and dispute history (FR-REP-1). Weights are explicit and
-- deterministic. Smoothing priors keep new workers at a neutral start.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.compute_reputation(p_worker uuid)
returns numeric
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_rating_avg      numeric := 0;
  v_rating_count    int := 0;
  v_completed       int := 0;
  v_cancelled       int := 0;
  v_requests        int := 0;
  v_responded_24h   int := 0;
  v_disputes        int := 0;
  v_review_comp     numeric;
  v_completion_comp numeric;
  v_response_comp   numeric;
  v_dispute_comp    numeric;
  v_score           numeric;
begin
  select coalesce(avg(rating), 0), count(*)
    into v_rating_avg, v_rating_count
    from public.reviews where worker_id = p_worker;

  select count(*) filter (where status = 'completed'),
         count(*) filter (where status = 'cancelled' and responded_at is not null)
    into v_completed, v_cancelled
    from public.jobs where worker_id = p_worker;

  select count(*),
         count(*) filter (where responded_at is not null
                          and responded_at - requested_at <= interval '24 hours')
    into v_requests, v_responded_24h
    from public.jobs where worker_id = p_worker;

  select count(*) into v_disputes
    from public.disputes
   where worker_id = p_worker and status in ('open', 'resolved');

  -- Review component: (avg-1)/4 maps 1..5 → 0..1; Laplace-style prior of 0.5
  -- with weight 3 so a single 5★ review doesn't jump to 100.
  v_review_comp := ((v_rating_avg - 1) / 4.0 * v_rating_count + 0.5 * 3) / (v_rating_count + 3);

  -- Completion: completed vs completed+cancelled-after-accept, prior 0.5/weight 2.
  v_completion_comp := (v_completed + 0.5 * 2)::numeric / (v_completed + v_cancelled + 2);

  -- Responsiveness: share of requests answered within 24h, prior 0.5/weight 2.
  v_response_comp := (v_responded_24h + 0.5 * 2)::numeric / (v_requests + 2);

  -- Disputes: each active/upheld dispute erodes this component.
  v_dispute_comp := 1.0 / (1 + v_disputes);

  v_score := round(100 * (0.40 * v_review_comp
                        + 0.25 * v_completion_comp
                        + 0.20 * v_response_comp
                        + 0.15 * v_dispute_comp), 2);

  insert into public.reputation_scores (worker_id, score, components, calculated_at)
  values (
    p_worker, v_score,
    jsonb_build_object(
      'review',       round(v_review_comp, 4),
      'completion',   round(v_completion_comp, 4),
      'response',     round(v_response_comp, 4),
      'disputes',     round(v_dispute_comp, 4),
      'rating_avg',   round(v_rating_avg, 2),
      'rating_count', v_rating_count,
      'jobs_completed', v_completed,
      'weights', (select value from public.app_config where key = 'matching_weights')
    ),
    now()
  )
  on conflict (worker_id) do update
    set score = excluded.score, components = excluded.components, calculated_at = now();

  update public.worker_profiles
     set reputation = v_score,
         rating_avg = round(v_rating_avg, 2),
         rating_count = v_rating_count,
         jobs_completed = v_completed
   where user_id = p_worker;

  return v_score;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Heuristic fraud checks (FR-REP-4): review velocity, duplicate device signals,
-- rating-pattern anomalies. Thresholds live in app_config. ML fraud is ROADMAP.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.run_fraud_checks(p_worker uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  cfg               jsonb;
  v_velocity_limit  int;
  v_min_reviews     int;
  v_stddev_floor    numeric;
  v_recent          int;
  v_count           int;
  v_stddev          numeric;
  v_avg             numeric;
  v_device_overlap  int;
begin
  select value into cfg from public.app_config where key = 'fraud_heuristics';
  v_velocity_limit := coalesce((cfg ->> 'review_velocity_per_day')::int, 5);
  v_min_reviews    := coalesce((cfg ->> 'min_reviews_for_pattern')::int, 5);
  v_stddev_floor   := coalesce((cfg ->> 'pattern_stddev_below')::numeric, 0.30);

  -- 1. Review velocity: too many reviews inside 24 hours.
  select count(*) into v_recent
    from public.reviews
   where worker_id = p_worker and created_at > now() - interval '24 hours';

  if v_recent > v_velocity_limit then
    insert into public.fraud_flags (worker_id, flag_type, severity, evidence)
    values (p_worker, 'review_velocity', 'high',
            jsonb_build_object('reviews_last_24h', v_recent, 'limit', v_velocity_limit))
    on conflict (worker_id, flag_type, status) do update
      set evidence = excluded.evidence, created_at = now();
  end if;

  -- 2. Duplicate device signals: distinct reviewer accounts sharing a device
  --    fingerprint with each other or with the worker (review-ring signal).
  select count(distinct df2.user_id) into v_device_overlap
    from public.reviews r
    join public.device_fingerprints df1 on df1.user_id = r.reviewer_id
    join public.device_fingerprints df2 on df2.fingerprint_hash = df1.fingerprint_hash
                                       and df2.user_id <> df1.user_id
   where r.worker_id = p_worker
     and (df2.user_id = p_worker
          or df2.user_id in (select reviewer_id from public.reviews where worker_id = p_worker));

  if v_device_overlap > 0 then
    insert into public.fraud_flags (worker_id, flag_type, severity, evidence)
    values (p_worker, 'device_overlap', 'high',
            jsonb_build_object('overlapping_accounts', v_device_overlap))
    on conflict (worker_id, flag_type, status) do update
      set evidence = excluded.evidence, created_at = now();
  end if;

  -- 3. Rating-pattern anomaly: many reviews, implausibly uniform, all-perfect.
  select count(*), coalesce(stddev_samp(rating), 0), coalesce(avg(rating), 0)
    into v_count, v_stddev, v_avg
    from public.reviews where worker_id = p_worker;

  if v_count >= v_min_reviews and v_stddev < v_stddev_floor and v_avg >= 4.9 then
    insert into public.fraud_flags (worker_id, flag_type, severity, evidence)
    values (p_worker, 'rating_pattern', 'medium',
            jsonb_build_object('review_count', v_count, 'stddev', round(v_stddev, 3),
                               'avg', round(v_avg, 2)))
    on conflict (worker_id, flag_type, status) do update
      set evidence = excluded.evidence, created_at = now();
  end if;
end;
$$;

-- Recalculation triggers (FR-REP-2): on job completion, new review, dispute.
create or replace function public.on_reputation_event()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_worker uuid;
begin
  v_worker := coalesce(new.worker_id, old.worker_id);
  perform public.compute_reputation(v_worker);
  perform public.run_fraud_checks(v_worker);
  return coalesce(new, old);
end;
$$;

create trigger reviews_recompute_reputation
  after insert on public.reviews
  for each row execute function public.on_reputation_event();

create trigger disputes_recompute_reputation
  after insert or update of status on public.disputes
  for each row execute function public.on_reputation_event();

create or replace function public.on_job_lifecycle_event()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.status in ('completed', 'cancelled', 'accepted', 'declined') then
    perform public.compute_reputation(new.worker_id);
  end if;
  return new;
end;
$$;

create trigger jobs_recompute_reputation
  after update of status on public.jobs
  for each row execute function public.on_job_lifecycle_event();
