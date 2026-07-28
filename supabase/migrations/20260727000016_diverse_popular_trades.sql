-- MyB · 0016 — popular categories, spread across the economy
--
-- Ranking home's category grid purely by booking volume filled all eight tiles
-- with the building trades, because those carry the most job history. That is
-- accurate and useless: the first screen then says "myB is for construction",
-- when the whole argument is that it covers tutors, hairdressers, cooks and
-- carers too.
--
-- So: still demand-driven, but the leader from each category comes first, then
-- the remaining slots go to the next most-booked trades overall. Breadth on the
-- first screen, popularity within it.

create or replace function public.get_popular_trades(p_limit int default 8)
returns table (slug text, label text, emoji text, category text, job_count bigint)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with demand as (
    select t.slug, t.label, t.emoji, t.category, t.sort_order,
           count(j.id) as job_count
      from public.trades t
      left join public.jobs j
        on j.trade_slug = t.slug
       and j.requested_at > now() - interval '90 days'
     group by t.slug, t.label, t.emoji, t.category, t.sort_order
  ),
  ranked as (
    select d.*,
           row_number() over (
             partition by d.category
             order by d.job_count desc, d.sort_order
           ) as rank_in_category
      from demand d
  )
  select r.slug, r.label, r.emoji, r.category, r.job_count
    from ranked r
   order by
     -- Category leaders first (one per category), then everything else,
     -- each group ordered by real demand.
     r.rank_in_category,
     r.job_count desc,
     r.sort_order
   limit greatest(1, least(p_limit, 40));
$$;
