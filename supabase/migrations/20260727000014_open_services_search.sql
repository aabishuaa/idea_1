-- MyB · 0014 — open the service taxonomy + real free-text search
--
-- The MVP shipped 12 construction trades, which is not what Jamaica's informal
-- economy looks like: tutors, hairdressers, cooks, seamstresses, caregivers,
-- phone-repair guys and drivers are just as invisible as plumbers, and are just
-- as much the point of this product.
--
-- Two changes:
--   1. Trades gain a category so the app can group them, and the list grows to
--      cover the service economy rather than only the building trades.
--   2. Discovery gets real free-text search. Typing "tutor" has to return
--      tutors, and it must work with NO embeddings and NO LLM key — semantic
--      ranking stays as an enhancement, never a dependency.

-- ── 1. Categories ───────────────────────────────────────────────────────────
alter table public.trades add column if not exists category text not null default 'Home & Repair';
alter table public.trades add column if not exists sort_order int not null default 100;

update public.trades set category = 'Home & Repair', sort_order = 10
 where slug in ('plumbing', 'electrical', 'carpentry', 'painting', 'masonry',
                'tiling', 'welding', 'roofing', 'appliance-repair',
                'ac-refrigeration', 'landscaping');
update public.trades set category = 'Auto & Transport', sort_order = 20
 where slug = 'mechanics';

insert into public.trades (slug, label, emoji, category, sort_order) values
  -- Education & training
  ('tutoring',          'Tutoring',              '📚', 'Education & Training', 30),
  ('music-lessons',     'Music Lessons',         '🎸', 'Education & Training', 31),
  ('driving-lessons',   'Driving Lessons',       '🚦', 'Education & Training', 32),
  ('exam-prep',         'CXC / Exam Prep',       '📝', 'Education & Training', 33),
  -- Beauty & wellness
  ('hairdressing',      'Hairdressing',          '💇', 'Beauty & Wellness', 40),
  ('barbering',         'Barbering',             '💈', 'Beauty & Wellness', 41),
  ('nail-tech',         'Nail Technician',       '💅', 'Beauty & Wellness', 42),
  ('makeup',            'Makeup Artist',         '💄', 'Beauty & Wellness', 43),
  ('massage',           'Massage Therapy',       '💆', 'Beauty & Wellness', 44),
  ('fitness',           'Fitness Training',      '🏋️', 'Beauty & Wellness', 45),
  -- Food
  ('catering',          'Catering',              '🍲', 'Food & Events', 50),
  ('baking',            'Baking & Pastry',       '🎂', 'Food & Events', 51),
  ('bartending',        'Bartending',            '🍹', 'Food & Events', 52),
  ('event-planning',    'Event Planning',        '🎉', 'Food & Events', 53),
  ('dj-music',          'DJ & Sound',            '🎧', 'Food & Events', 54),
  ('photography',       'Photography & Video',   '📸', 'Food & Events', 55),
  -- Home services
  ('cleaning',          'Cleaning',              '🧹', 'Home & Care', 60),
  ('laundry',           'Laundry & Ironing',     '🧺', 'Home & Care', 61),
  ('childcare',         'Childcare',             '🧸', 'Home & Care', 62),
  ('elder-care',        'Elder Care',            '🤝', 'Home & Care', 63),
  ('pest-control',      'Pest Control',          '🐜', 'Home & Care', 64),
  ('pool-cleaning',     'Pool Cleaning',         '🏊', 'Home & Care', 65),
  -- Making & mending
  ('dressmaking',       'Dressmaking & Tailoring', '🧵', 'Making & Mending', 70),
  ('shoe-repair',       'Shoe Repair',           '👞', 'Making & Mending', 71),
  ('upholstery',        'Upholstery',            '🛋️', 'Making & Mending', 72),
  ('furniture-making',  'Furniture Making',      '🪑', 'Making & Mending', 73),
  -- Tech & business
  ('computer-repair',   'Computer Repair',       '💻', 'Tech & Business', 80),
  ('phone-repair',      'Phone Repair',          '📱', 'Tech & Business', 81),
  ('web-design',        'Web & Graphic Design',  '🎨', 'Tech & Business', 82),
  ('bookkeeping',       'Bookkeeping',           '📒', 'Tech & Business', 83),
  ('social-media',      'Social Media Help',     '📣', 'Tech & Business', 84),
  -- Transport & trades
  ('delivery',          'Delivery & Courier',    '🛵', 'Auto & Transport', 90),
  ('moving',            'Moving & Haulage',      '🚚', 'Auto & Transport', 91),
  ('car-detailing',     'Car Detailing',         '🚿', 'Auto & Transport', 92),
  ('generator-repair',  'Generator Repair',      '🔋', 'Auto & Transport', 93),
  ('security',          'Security Services',     '🛡️', 'Home & Care', 66)
on conflict (slug) do nothing;

-- Colloquial search terms per trade. Customers type what they say, not what a
-- listing says: "mind my baby" has no lexeme in common with "babysitting and
-- nanny service". These bridge that gap and are matched alongside the listing
-- text, including Patois phrasing.
alter table public.trades add column if not exists synonyms text not null default '';

update public.trades set synonyms = case slug
  when 'plumbing'         then 'pipe leak water tap faucet toilet sink drain blockage burst plumber shower cistern'
  when 'electrical'       then 'light wiring socket outlet breaker current power fan switch electrician shock bulb'
  when 'carpentry'        then 'wood door window cupboard cabinet shelf furniture carpenter joinery'
  when 'painting'         then 'paint wall colour coat spray decorate painter varnish'
  when 'masonry'          then 'block wall concrete cement steps foundation plaster mason builder'
  when 'tiling'           then 'tile floor bathroom kitchen grout tiler'
  when 'welding'          then 'grill gate rail metal steel weld welder burglar bars'
  when 'roofing'          then 'roof zinc shingle leak ceiling gutter roofer'
  when 'appliance-repair' then 'fridge washing machine washer dryer stove oven microwave appliance fix'
  when 'ac-refrigeration' then 'ac air condition aircon cooling gas freezer chiller unit'
  when 'landscaping'      then 'yard lawn grass bush garden tree trim cut hedge gardener'
  when 'mechanics'        then 'car vehicle engine brake service mechanic auto tyre battery'
  when 'tutoring'         then 'tutor teacher lesson homework study school child learning extra classes'
  when 'exam-prep'        then 'cxc csec cape exam past paper sba revision study'
  when 'music-lessons'    then 'piano guitar keyboard singing voice music teacher lesson'
  when 'driving-lessons'  then 'driving lesson learner licence road test instructor'
  when 'hairdressing'     then 'hair braid braids weave wig cornrow plait salon stylist natural relaxer'
  when 'barbering'        then 'barber haircut trim fade shave beard cut hair man'
  when 'nail-tech'        then 'nails manicure pedicure gel acrylic polish nail'
  when 'makeup'           then 'makeup mua bridal wedding face beat glam'
  when 'massage'          then 'massage back pain spa therapy rub'
  when 'fitness'          then 'gym trainer workout exercise weight loss fitness'
  when 'catering'         then 'food cook chef caterer party wedding meal dinner curry'
  when 'baking'           then 'cake baker pastry birthday wedding cupcake bread rum cake sweet'
  when 'bartending'       then 'bar drinks cocktail bartender rum party'
  when 'event-planning'   then 'event party wedding planner decor coordinator function'
  when 'dj-music'         then 'dj sound music party selector speaker system'
  when 'photography'      then 'photo picture camera video photographer shoot wedding graduation'
  when 'cleaning'         then 'clean cleaner housekeeper maid helper tidy scrub domestic'
  when 'laundry'          then 'wash clothes iron laundry fold dry cleaning'
  when 'childcare'        then 'baby babysitter sitter nanny child children kids mind watch toddler daycare'
  when 'elder-care'       then 'elderly old grandma grandpa caregiver nurse care companion helper'
  when 'pest-control'     then 'roach rat mice ant termite bug spray exterminator pest mosquito'
  when 'pool-cleaning'    then 'pool swimming water clean chemical'
  when 'dressmaking'      then 'sew sewing dress tailor seamstress hem alter clothes uniform stitch'
  when 'shoe-repair'      then 'shoe boot sole heel cobbler repair leather bag'
  when 'upholstery'       then 'sofa couch chair cushion foam upholstery seat'
  when 'furniture-making' then 'bed table wardrobe shelf custom furniture build'
  when 'computer-repair'  then 'computer laptop pc desktop virus screen windows tech repair'
  when 'phone-repair'     then 'phone screen crack battery iphone android cell repair charging'
  when 'web-design'       then 'website web logo flyer design graphic online business card'
  when 'bookkeeping'      then 'books accounts accounting invoice tax gct records bookkeeper'
  when 'social-media'     then 'instagram facebook tiktok social media marketing posts page'
  when 'delivery'         then 'delivery courier drop off pick up send package rider'
  when 'moving'           then 'move moving truck haul carry furniture removal relocate'
  when 'car-detailing'    then 'car wash detail clean polish wax vehicle valet'
  when 'generator-repair' then 'generator genset lawnmower small engine pressure washer'
  when 'security'         then 'security guard watchman officer protection gate'
  else synonyms end;

create index if not exists trades_synonyms_search_idx
  on public.trades using gin (to_tsvector('english', label || ' ' || synonyms));

-- ── 2. Free-text search ─────────────────────────────────────────────────────
-- A stored tsvector over the words a customer would actually type. Title is
-- weighted above the body so "tutor" ranks a tutoring listing over a plumber
-- who merely mentions the word.
alter table public.service_descriptions
  add column if not exists search_vector tsvector
  generated always as (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(description, '')), 'B')
  ) stored;

create index if not exists service_descriptions_search_idx
  on public.service_descriptions using gin (search_vector);

-- Trigram index for the "mi sink a leak" case — plain-language phrasing that
-- stemming misses but fuzzy matching catches.
create extension if not exists pg_trgm;
create index if not exists service_descriptions_title_trgm_idx
  on public.service_descriptions using gin (title gin_trgm_ops);
create index if not exists trades_label_trgm_idx
  on public.trades using gin (label gin_trgm_ops);

-- Resolve a typed phrase to a trade slug when it clearly names one
-- ("tutor" → tutoring). Deterministic; no LLM involved.
create or replace function public.resolve_trade(p_query text)
returns text
language sql
stable
as $$
  select t.slug
    from public.trades t
   where p_query is not null
     and length(trim(p_query)) > 1
     and (
       t.label ilike '%' || trim(p_query) || '%'
       or t.slug ilike '%' || replace(trim(lower(p_query)), ' ', '-') || '%'
       or similarity(t.label, trim(p_query)) > 0.42
       -- Colloquial phrasing: any synonym word appearing in the query.
       or to_tsvector('english', t.label || ' ' || t.synonyms)
          @@ nullif(replace(plainto_tsquery('english', trim(p_query))::text, ' & ', ' | '), '')::tsquery
     )
   order by similarity(t.label, trim(p_query)) desc,
            ts_rank(to_tsvector('english', t.label || ' ' || t.synonyms),
                    coalesce(nullif(replace(plainto_tsquery('english', trim(p_query))::text,
                                            ' & ', ' | '), '')::tsquery,
                             plainto_tsquery('english', 'zzzz'))) desc
   limit 1;
$$;

-- ── 3. match_workers with text relevance ───────────────────────────────────
-- Replaces the 0010 version. Same weighted, deterministic ranking, plus a
-- p_query text arm so search works with no embeddings at all. Dropped and
-- recreated rather than overloaded so named-argument calls stay unambiguous.
drop function if exists public.match_workers(vector, double precision, double precision, text, text, numeric, int);

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
      and (q.trade is null or sd.trade_slug = q.trade)
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

-- Popular categories for the home grid — ranked by real demand (jobs in the
-- last 90 days), so the suggestions reflect what people actually book.
create or replace function public.get_popular_trades(p_limit int default 8)
returns table (slug text, label text, emoji text, category text, job_count bigint)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select t.slug, t.label, t.emoji, t.category, count(j.id) as job_count
    from public.trades t
    left join public.jobs j
      on j.trade_slug = t.slug
     and j.requested_at > now() - interval '90 days'
   group by t.slug, t.label, t.emoji, t.category, t.sort_order
   order by count(j.id) desc, t.sort_order
   limit greatest(1, least(p_limit, 40));
$$;
