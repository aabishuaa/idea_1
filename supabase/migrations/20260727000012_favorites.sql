-- MyB · 0012 — saved pros (favourites)
-- Customers save workers they trust so re-hiring is one tap. Own-rows-only
-- under RLS; the list is private to the customer who made it.

create table public.favorites (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  worker_id  uuid not null references public.worker_profiles (user_id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, worker_id)
);

create index favorites_user_idx on public.favorites (user_id, created_at desc);

alter table public.favorites enable row level security;

create policy "favorites: own rows"
  on public.favorites for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Resolve the caller's saved pros into the same shape match_workers returns,
-- so the app renders them with the identical worker card.
--
-- This cannot go through match_workers: that function caps its result at 50
-- rows by design, so a saved pro ranked below the top 50 would silently
-- disappear from the list. SECURITY DEFINER is required because profiles RLS
-- only exposes the caller's own row — the filter here is the favorites table
-- itself, which is already scoped to auth.uid().
create or replace function public.get_favorite_workers()
returns table (
  worker_id         uuid,
  full_name         text,
  avatar_url        text,
  headline          text,
  parish            text,
  trade_slug        text,
  service_title     text,
  rate_min_jmd      numeric,
  rate_max_jmd      numeric,
  rate_unit         text,
  reputation        numeric,
  rating_avg        numeric,
  rating_count      int,
  jobs_completed    int,
  identity_verified boolean,
  tier_skill        boolean,
  tier_business     boolean,
  available         boolean,
  distance_km       numeric,
  similarity        numeric,
  match_score       numeric
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with best_service as (
    select sd.user_id,
           sd.trade_slug,
           sd.title,
           row_number() over (partition by sd.user_id order by sd.id) as rn
      from public.service_descriptions sd
  )
  select wp.user_id,
         p.full_name,
         p.avatar_url,
         wp.headline,
         wp.parish,
         bs.trade_slug,
         coalesce(bs.title, wp.headline),
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
         null::numeric,
         null::numeric,
         0::numeric
    from public.favorites f
    join public.worker_profiles wp on wp.user_id = f.worker_id
    join public.profiles p on p.id = wp.user_id
    left join best_service bs on bs.user_id = wp.user_id and bs.rn = 1
   where f.user_id = auth.uid()
   order by f.created_at desc;
$$;
