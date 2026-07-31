-- Demo helper: give a few seeded workers a Virtual base.
--
-- The seed puts every worker in a real parish, so "Virtual" is invisible in a
-- demo until somebody is actually based there. Run this in the SQL Editor after
-- the seed to make the feature demonstrable.
--
-- Picks the trades where working remotely is genuinely normal — a tutor or a
-- designer does not need to be in your parish, whereas a plumber does. Nothing
-- here is required by the app; it is demo dressing only.

update public.worker_profiles wp
   set parish = 'Virtual',
       -- A virtual worker has no meaningful point location, and leaving a stale
       -- one behind would let a proximity search score them as if they were
       -- physically in Kingston.
       location = null
 where wp.user_id in (
   select sd.user_id
     from public.service_descriptions sd
    where sd.trade_slug in ('tutoring', 'graphic-design', 'web-design',
                            'bookkeeping', 'social-media', 'photography')
    limit 8
 );

-- What you should see afterwards.
select
  p.full_name,
  wp.parish,
  wp.reputation,
  (select string_agg(sd.trade_slug, ', ')
     from public.service_descriptions sd where sd.user_id = wp.user_id) as trades
from public.worker_profiles wp
join public.profiles p on p.id = wp.user_id
where wp.parish = 'Virtual'
order by wp.reputation desc;

-- Sanity check: a virtual worker must come back from a search filtered to a
-- parish they are not in. This is the whole point of the option.
select full_name, parish, match_score
  from public.match_workers(p_parish => 'St. James', p_limit => 40)
 where parish = 'Virtual';
