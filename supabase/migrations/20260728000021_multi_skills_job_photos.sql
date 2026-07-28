-- MyB · 0021 — a worker can offer several things, and a request can carry photos
--
-- TWO PROBLEMS
--
-- 1. One skill per worker. The taxonomy opened up in 0014 (48 trades across
--    the whole informal economy), but the UI could only ever save a single
--    service. Real people are not one thing: someone bakes AND teaches.
--    Worse, anything genuinely not on the list had nowhere to go —
--    service_descriptions.trade_slug is NOT NULL and match_workers inner-joins
--    trades, so a null slug would make a worker invisible to search.
--
--    Fix: an `other` trade for skills we have not catalogued yet, plus one RPC
--    that replaces a worker's whole service set atomically. Discovery still
--    works for custom skills because match_workers ranks on
--    service_descriptions.search_vector (title + description), which is where
--    the typed skill name lands.
--
-- 2. "Mi sink a leak" is much clearer with a photo. Requests could not carry
--    one, so the worker was deciding blind.

-- ── A home for skills that are not in the taxonomy ─────────────────────────
insert into public.trades (slug, label, emoji, category, sort_order, synonyms)
values ('other', 'Other skill', '✨', 'Other', 999,
        'custom skill service speciality specialty other')
on conflict (slug) do nothing;

-- ── Replace a worker's services in one call ────────────────────────────────
-- Takes a JSON array of { trade_slug, title, description }. Anything the
-- worker removed in the UI is deleted; everything else is inserted fresh, so
-- the saved set is exactly what was on screen.
--
-- SECURITY DEFINER for the same reason as 0018: service_descriptions has
-- column-level grants (a client must never write `embedding` and game
-- semantic ranking), and this writes only auth.uid()'s own rows.
create or replace function public.save_worker_services(p_services jsonb)
returns table (service_id uuid, trade_slug text, title text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_item jsonb;
  v_slug text;
  v_title text;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;

  if jsonb_typeof(p_services) <> 'array' then
    raise exception 'p_services must be a JSON array';
  end if;

  -- A worker with no services is invisible to search, which is never what the
  -- save button means. Refuse rather than silently emptying the profile.
  if jsonb_array_length(p_services) = 0 then
    raise exception 'at least one service is required';
  end if;

  delete from public.service_descriptions where user_id = v_user;

  for v_item in select * from jsonb_array_elements(p_services)
  loop
    v_title := trim(coalesce(v_item->>'title', ''));
    if v_title = '' then
      continue;
    end if;

    -- An unknown slug becomes 'other' rather than failing the whole save:
    -- the typed title is what search actually matches on.
    v_slug := coalesce(v_item->>'trade_slug', 'other');
    if not exists (select 1 from public.trades t where t.slug = v_slug) then
      v_slug := 'other';
    end if;

    insert into public.service_descriptions (user_id, trade_slug, title, description)
    values (v_user, v_slug, left(v_title, 80), coalesce(v_item->>'description', ''))
    returning id, service_descriptions.trade_slug, service_descriptions.title
      into service_id, trade_slug, title;
    return next;
  end loop;
end;
$$;

revoke execute on function public.save_worker_services from public, anon;
grant execute on function public.save_worker_services to authenticated;

-- ── Photos attached to a job request ───────────────────────────────────────
create table if not exists public.job_photos (
  id           uuid primary key default gen_random_uuid(),
  job_id       uuid not null references public.jobs (id) on delete cascade,
  uploaded_by  uuid not null references public.profiles (id) on delete cascade,
  storage_path text not null,
  created_at   timestamptz not null default now()
);

create index if not exists job_photos_job_idx on public.job_photos (job_id, created_at);

alter table public.job_photos enable row level security;

-- Only the two people on the job. A job photo can show the inside of
-- somebody's home, so this is never world-readable.
drop policy if exists "job photos: participants read" on public.job_photos;
create policy "job photos: participants read"
  on public.job_photos for select
  to authenticated
  using (exists (
    select 1 from public.jobs j
     where j.id = job_id and (j.customer_id = auth.uid() or j.worker_id = auth.uid())
  ));

drop policy if exists "job photos: participants add" on public.job_photos;
create policy "job photos: participants add"
  on public.job_photos for insert
  to authenticated
  with check (
    uploaded_by = auth.uid()
    and exists (
      select 1 from public.jobs j
       where j.id = job_id and (j.customer_id = auth.uid() or j.worker_id = auth.uid())
    )
  );

drop policy if exists "job photos: uploader removes" on public.job_photos;
create policy "job photos: uploader removes"
  on public.job_photos for delete
  to authenticated
  using (uploaded_by = auth.uid());

-- ── Storage for those photos ───────────────────────────────────────────────
-- Private bucket, files stored under <job_id>/… so access is decided by job
-- membership rather than by who happened to upload the file.
insert into storage.buckets (id, name, public)
values ('job-photos', 'job-photos', false)
on conflict (id) do nothing;

drop policy if exists "job photos storage: participants read" on storage.objects;
create policy "job photos storage: participants read"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'job-photos'
    and exists (
      select 1 from public.jobs j
       where j.id::text = (storage.foldername(name))[1]
         and (j.customer_id = auth.uid() or j.worker_id = auth.uid())
    )
  );

drop policy if exists "job photos storage: participants upload" on storage.objects;
create policy "job photos storage: participants upload"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'job-photos'
    and exists (
      select 1 from public.jobs j
       where j.id::text = (storage.foldername(name))[1]
         and (j.customer_id = auth.uid() or j.worker_id = auth.uid())
    )
  );

-- ── The worker's inbox needs to know a request has photos ──────────────────
-- Replaces the 0018 version: same shape plus photo_count, so the request card
-- can show "3 photos" without a second round trip per row.
drop function if exists public.get_incoming_requests();
create or replace function public.get_incoming_requests()
returns table (
  id                uuid,
  title             text,
  description       text,
  trade_slug        text,
  parish            text,
  urgency           public.job_urgency,
  budget_min_jmd    numeric,
  budget_max_jmd    numeric,
  requested_at      timestamptz,
  customer_id       uuid,
  customer_name     text,
  customer_avatar   text,
  customer_verified boolean,
  photo_count       int
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select j.id, j.title, j.description, j.trade_slug, j.parish, j.urgency,
         j.budget_min_jmd, j.budget_max_jmd, j.requested_at,
         p.id, p.full_name, p.avatar_url, p.identity_verified,
         (select count(*)::int from public.job_photos ph where ph.job_id = j.id)
    from public.jobs j
    join public.profiles p on p.id = j.customer_id
   where j.worker_id = auth.uid()
     and j.status = 'requested'
   order by j.requested_at desc;
$$;

revoke execute on function public.get_incoming_requests from public, anon;
grant execute on function public.get_incoming_requests to authenticated;


-- ── Discovery has to reach uncatalogued skills ─────────────────────────────
-- Same function as 0014 with one predicate relaxed; see the comment inline.
create or replace function public.match_workers(
  p_embedding  vector(768) default null,
  p_lat        double precision default null,
  p_lng        double precision default null,
  p_trade_slug text default null,
  p_parish     text default null,
  p_min_rating numeric default null,
  p_limit      int default 20,
  p_query      text default null
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
  with q as (
    select
      nullif(trim(coalesce(p_query, '')), '') as raw,
      -- OR semantics, not AND. People type sentences ("someone to braid my
      -- hair", "mi sink a leak under di counter"); requiring every lexeme to
      -- appear returns nothing. Matching any lexeme and letting ts_rank order
      -- the results is what makes plain-language search actually work.
      case when nullif(trim(coalesce(p_query, '')), '') is not null
           then nullif(
                  replace(plainto_tsquery('english', trim(p_query))::text, ' & ', ' | '),
                  '')::tsquery
      end as tsq,
      -- A typed phrase that names a trade filters by it directly.
      coalesce(p_trade_slug, public.resolve_trade(p_query)) as trade
  ),
  candidates as (
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
      -- Text relevance: full-text rank, or fuzzy title/label similarity for
      -- phrasing the stemmer misses.
      case
        when q.tsq is not null then
          greatest(
            ts_rank(sd.search_vector, q.tsq),
            ts_rank(to_tsvector('english', t.label || ' ' || t.synonyms), q.tsq),
            similarity(sd.title, q.raw),
            similarity(t.label, q.raw)
          )
        else null
      end as text_rank,
      row_number() over (
        partition by wp.user_id
        order by
          case
            when q.tsq is not null then -greatest(
              ts_rank(sd.search_vector, q.tsq),
              ts_rank(to_tsvector('english', t.label || ' ' || t.synonyms), q.tsq),
              similarity(sd.title, q.raw),
              similarity(t.label, q.raw))
            when p_embedding is not null and sd.embedding is not null
              then sd.embedding <=> p_embedding
            else 1
          end
      ) as service_rank
    from public.worker_profiles wp
    join public.profiles p on p.id = wp.user_id
    join public.service_descriptions sd on sd.user_id = wp.user_id
    join public.trades t on t.slug = sd.trade_slug
    cross join q
    where wp.visible = true
      -- Trade filter, with one deliberate escape hatch. When a typed phrase
      -- resolves to a catalogued trade we filter to it, which is what makes
      -- "plumber" return plumbers. But a skill nobody has catalogued lives
      -- under `other` (0021), and would be filtered out by a query that
      -- happens to resolve — "drone roof inspection" resolves to roofing and
      -- would hide the one person who actually does it. So `other` services
      -- stay in whenever their own words match.
      and (
        q.trade is null
        or sd.trade_slug = q.trade
        or (sd.trade_slug = 'other' and q.tsq is not null and sd.search_vector @@ q.tsq)
      )
      and (p_parish is null or wp.parish = p_parish)
      and (p_min_rating is null or wp.rating_avg >= p_min_rating)
      -- With a typed query and no resolved trade, keep only real text matches.
      and (
        q.tsq is null
        or q.trade is not null
        or sd.search_vector @@ q.tsq
        or to_tsvector('english', t.label || ' ' || t.synonyms) @@ q.tsq
        or similarity(sd.title, q.raw) > 0.3
        or similarity(t.label, q.raw) > 0.3
      )
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
      -- Text relevance leads when the customer typed something; otherwise the
      -- weights fall back to the browsing mix documented in app_config.
      case when c.text_rank is not null
           then 0.35 * least(c.text_rank * 4, 1.0)
           else 0.35 * coalesce(c.similarity, 0.5) end
      + 0.25 * coalesce(1 - least(c.distance_km, 30) / 30.0, 0.5)
      + 0.20 * (c.reputation / 100.0)
      + 0.10 * (case when c.available then 1 else 0 end)
      + 0.10 * least(c.jobs_completed, 20) / 20.0
    )::numeric, 4) as match_score
  from candidates c
  where c.service_rank = 1
  order by match_score desc
  limit greatest(1, least(p_limit, 100));
$$;
