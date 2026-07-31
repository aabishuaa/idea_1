-- MyB · 0023 — Virtual as a location, search by name, the Explore feed,
--                contact details, and a real date window on a job.
--
-- Five changes that came out of device testing, grouped because four of them
-- touch match_workers and it must only be rewritten once.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. A job carries a date WINDOW, not a mood.
--
-- `urgency` asked the customer to translate "the plumber needs to come before
-- Friday" into one of four adjectives, and the worker then had to translate it
-- back. Both sides lose. Dates are what everyone actually means.
--
-- urgency is KEPT and still derived from these dates (see derive_urgency): it
-- feeds reputation's response-time component and the matching mix, and those
-- are deliberately deterministic. The UI stops asking for it; the database
-- keeps computing it.
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.jobs add column if not exists needed_from date;
alter table public.jobs add column if not exists needed_by   date;

-- A window has to be a window.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'jobs_needed_window_ordered'
  ) then
    alter table public.jobs add constraint jobs_needed_window_ordered
      check (needed_from is null or needed_by is null or needed_by >= needed_from);
  end if;
end $$;

grant update (needed_from, needed_by) on public.jobs to authenticated;

/**
 * Urgency from the date window, so the stored value cannot drift from the
 * dates the customer actually picked.
 *
 * Thresholds are days from now to the START of the window — when they need
 * someone there, not when they will tolerate them finishing.
 */
create or replace function public.derive_urgency(
  p_from date,
  p_by   date
)
returns text
language sql
immutable
as $$
  select case
    -- No dates given: they are flexible, which is exactly what 'low' means.
    when p_from is null and p_by is null then 'normal'
    when coalesce(p_from, p_by) <= current_date + 1 then 'emergency'
    when coalesce(p_from, p_by) <= current_date + 3 then 'high'
    when coalesce(p_from, p_by) <= current_date + 14 then 'normal'
    else 'low'
  end;
$$;

/** Keep jobs.urgency in step with the window on every write. */
create or replace function public.jobs_sync_urgency()
returns trigger
language plpgsql
as $$
begin
  -- Only take over when the customer actually gave us dates. A job created by
  -- an older client, or by the seed, keeps whatever urgency it was given.
  if new.needed_from is not null or new.needed_by is not null then
    new.urgency := public.derive_urgency(new.needed_from, new.needed_by);
  end if;
  return new;
end;
$$;

drop trigger if exists jobs_sync_urgency on public.jobs;
create trigger jobs_sync_urgency
  before insert or update of needed_from, needed_by on public.jobs
  for each row execute function public.jobs_sync_urgency();

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Contact details.
--
-- Deliberately a SEPARATE TABLE rather than columns on worker_profiles.
-- worker_profiles grants SELECT broadly (the read policy is "visible = true"),
-- so a phone column there would be world-readable to every signed-in user; and
-- revoking select on just those columns would break every `select('*')` the
-- app already makes against that table. A separate table gets its own policy
-- and cannot leak through an existing query.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.worker_contacts (
  user_id    uuid primary key references public.profiles (id) on delete cascade,
  phone      text,
  email      text,
  website    text,
  /*
    Off by default. A worker publishing a phone number to every signed-in user
    is a decision they make, not a side effect of filling in a form — and for
    the informal workers this is built for, an exposed number is a real-world
    risk, not a privacy abstraction.
  */
  show_publicly boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.worker_contacts enable row level security;

create trigger worker_contacts_updated_at
  before update on public.worker_contacts
  for each row execute function public.set_updated_at();

/*
  Who may read a contact row:
    · the owner, always;
    · anyone, if the owner published it;
    · a customer who has an actual booking with them — you need to be able to
      phone the plumber you hired, whether or not he publishes his number;
    · admins.
*/
create policy "worker_contacts: read own, published, or booked"
  on public.worker_contacts for select
  to authenticated
  using (
    user_id = auth.uid()
    or show_publicly = true
    or exists (
      select 1 from public.jobs j
       where j.worker_id = public.worker_contacts.user_id
         and j.customer_id = auth.uid()
         and j.status in ('accepted', 'in_progress', 'completed')
    )
    or public.is_admin()
  );

create policy "worker_contacts: write own"
  on public.worker_contacts for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "worker_contacts: update own"
  on public.worker_contacts for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "worker_contacts: delete own"
  on public.worker_contacts for delete
  to authenticated
  using (user_id = auth.uid());

grant select, insert, update, delete on public.worker_contacts to authenticated;

/** Save your own contact details. */
create or replace function public.save_my_contact(
  p_phone   text,
  p_email   text,
  p_website text,
  p_show    boolean
)
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

  insert into public.worker_contacts (user_id, phone, email, website, show_publicly)
  values (v_user, nullif(trim(coalesce(p_phone, '')), ''),
                  nullif(trim(coalesce(p_email, '')), ''),
                  nullif(trim(coalesce(p_website, '')), ''),
                  coalesce(p_show, false))
  on conflict (user_id) do update
    set phone         = excluded.phone,
        email         = excluded.email,
        website       = excluded.website,
        show_publicly = excluded.show_publicly;
end;
$$;

revoke all on function public.save_my_contact(text, text, text, boolean) from public, anon;
grant execute on function public.save_my_contact(text, text, text, boolean) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Search by name needs an index that can do it.
-- ─────────────────────────────────────────────────────────────────────────────
create index if not exists profiles_full_name_trgm
  on public.profiles using gin (full_name gin_trgm_ops);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. The Explore feed: browse the work, not the listings.
--
-- Someone who does not yet know what they need cannot use a search box. This
-- returns portfolio photographs with enough of their owner attached to render
-- a card and open a profile.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.get_explore_feed(
  p_limit  int default 30,
  p_offset int default 0
)
returns table (
  item_id           uuid,
  storage_path      text,
  caption           text,
  worker_id         uuid,
  full_name         text,
  avatar_url        text,
  headline          text,
  parish            text,
  reputation        numeric,
  rating_avg        numeric,
  rating_count      int,
  identity_verified boolean
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with ranked as (
    select
      pi.id as item_id,
      pi.storage_path,
      coalesce(pi.caption, '') as caption,
      wp.user_id as worker_id,
      p.full_name,
      p.avatar_url,
      wp.headline,
      wp.parish,
      wp.reputation,
      wp.rating_avg,
      wp.rating_count,
      p.identity_verified,
      /*
        No more than three photos per worker in the feed. One worker with
        twenty uploads would otherwise BE the feed, which defeats the point of
        browsing — and it is the workers with the least work who most need to
        be seen.
      */
      row_number() over (
        partition by wp.user_id
        order by pi.created_at desc
      ) as per_worker,
      /*
        A stable shuffle. Ordering by reputation makes the same six people the
        whole of Explore forever; ordering randomly breaks pagination (rows
        repeat and vanish between pages). Hashing the item id with today's date
        gives an order that is arbitrary, stable for the whole day so paging
        works, and different tomorrow.
      */
      md5(pi.id::text || to_char(current_date, 'YYYY-MM-DD')) as shuffle
    from public.portfolio_items pi
    join public.worker_profiles wp on wp.user_id = pi.user_id
    join public.profiles p on p.id = wp.user_id
    where wp.visible = true
  )
  select
    item_id, storage_path, caption, worker_id, full_name, avatar_url,
    headline, parish, reputation, rating_avg, rating_count, identity_verified
  from ranked
  where per_worker <= 3
  order by shuffle
  offset greatest(0, p_offset)
  limit greatest(1, least(p_limit, 60));
$$;

revoke all on function public.get_explore_feed(int, int) from public, anon;
grant execute on function public.get_explore_feed(int, int) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. match_workers v3: Virtual workers, and finding a person by name.
-- ─────────────────────────────────────────────────────────────────────────────
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
      /*
        How strongly the typed words match this worker's NAME.
        Kept separate from text_rank because it has to do two extra jobs: rescue
        the row from the trade filter, and outrank service matches. Someone who
        types "Tashana Thompson" is not describing a job.
      */
      case
        when q.raw is not null then similarity(p.full_name, q.raw)
        else null
      end as name_rank,
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
      -- Trade filter, with two deliberate escape hatches. When a typed phrase
      -- resolves to a catalogued trade we filter to it, which is what makes
      -- "plumber" return plumbers. But:
      --   · a skill nobody has catalogued lives under `other` (0021) and would
      --     be filtered out by a query that happens to resolve — "drone roof
      --     inspection" resolves to roofing and would hide the one person who
      --     actually does it;
      --   · a person's NAME can resolve to a trade by accident (a surname that
      --     stems onto a trade synonym), which would hide the very person the
      --     customer asked for by name.
      and (
        q.trade is null
        or sd.trade_slug = q.trade
        or (sd.trade_slug = 'other' and q.tsq is not null and sd.search_vector @@ q.tsq)
        or similarity(p.full_name, q.raw) > 0.3
      )
      /*
        Location. A Virtual worker is not in a parish — they are unconstrained
        by parish — so a parish filter must not exclude them. This is the whole
        point of the option: the tutor who works over the phone, and the
        tradesperson willing to cross a parish line for the right job, were
        both invisible to every search outside the one parish they were forced
        to name.
      */
      and (p_parish is null or wp.parish = p_parish or wp.parish = 'Virtual')
      and (p_min_rating is null or wp.rating_avg >= p_min_rating)
      -- With a typed query and no resolved trade, keep only real matches —
      -- against the service, the trade, or the person's name.
      and (
        q.tsq is null
        or q.trade is not null
        or sd.search_vector @@ q.tsq
        or to_tsvector('english', t.label || ' ' || t.synonyms) @@ q.tsq
        or similarity(sd.title, q.raw) > 0.3
        or similarity(t.label, q.raw) > 0.3
        or similarity(p.full_name, q.raw) > 0.3
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
      /*
        Relevance. A strong name match takes the relevance slot outright: if you
        searched for a person and they exist, they are the answer, and no
        service description should outrank them.
      */
      case
        when coalesce(c.name_rank, 0) > 0.4 then 0.35 * least(c.name_rank * 1.4, 1.0)
        when c.text_rank is not null        then 0.35 * least(c.text_rank * 4, 1.0)
        else 0.35 * coalesce(c.similarity, 0.5)
      end
      /*
        Proximity. Virtual workers get a high-but-not-perfect score rather than
        the 0.5 that a NULL distance used to collapse to: distance genuinely is
        not a constraint for them, so scoring them as "unknown location" was
        wrong. Not a full 1.0 either — that would put every virtual worker above
        every local one on a quarter of the score, which is not what a customer
        looking for someone nearby wants.
      */
      + 0.25 * (case
                  when c.parish = 'Virtual' then 0.85
                  else coalesce(1 - least(c.distance_km, 30) / 30.0, 0.5)
                end)
      + 0.20 * (c.reputation / 100.0)
      + 0.10 * (case when c.available then 1 else 0 end)
      + 0.10 * least(c.jobs_completed, 20) / 20.0
    )::numeric, 4) as match_score
  from candidates c
  where c.service_rank = 1
  order by match_score desc
  limit greatest(1, least(p_limit, 100));
$$;
