-- MyB — hosted-project demo helper (run in the Supabase SQL Editor).
-- Auth users cannot be safely seeded by SQL on a hosted project, so:
--   1. Create accounts through the app's sign-up flow (2–3 accounts).
--   2. Find their UUIDs in Dashboard → Authentication → Users.
--   3. Paste the UUIDs below and run this script to promote one of them into
--      a rich demo worker profile.

do $$
declare
  -- ▼▼▼ REPLACE_ME: paste real user UUIDs from Authentication → Users ▼▼▼
  v_worker   uuid := 'REPLACE-WITH-WORKER-USER-UUID';
  v_customer uuid := 'REPLACE-WITH-CUSTOMER-USER-UUID';
  -- ▲▲▲ ─────────────────────────────────────────────────────────────── ▲▲▲
  v_job uuid;
begin
  update public.profiles
     set is_worker = true, parish = 'Kingston', identity_verified = true
   where id = v_worker;

  update public.profiles
     set is_customer = true, parish = 'St. Andrew'
   where id = v_customer;

  insert into public.worker_profiles
    (user_id, headline, bio, parish, location, years_experience,
     rate_min_jmd, rate_max_jmd, rate_unit, available)
  values
    (v_worker, 'Licensed electrician — residential & commercial',
     'Licensed electrician with 8+ years across residential and commercial jobs. Fast, tidy, guaranteed.',
     'Kingston', st_setsrid(st_makepoint(-76.7832, 17.9714), 4326)::geography,
     8, 3500, 3500, 'hour', true)
  on conflict (user_id) do nothing;

  insert into public.service_descriptions (user_id, trade_slug, title, description)
  values
    (v_worker, 'electrical', 'Wiring & rewiring',
     'House wiring, rewiring old installations, breaker panels, fixing outlets and switches, fault finding, solar hookup.');

  -- One completed job + review so reputation has signal.
  insert into public.jobs
    (customer_id, worker_id, title, description, trade_slug, parish, urgency,
     status, requested_at, responded_at, started_at, completed_at, agreed_price_jmd)
  values
    (v_customer, v_worker, 'Rewire living room', 'Old wiring sparking at the socket.',
     'electrical', 'St. Andrew', 'high', 'completed',
     now() - interval '10 days', now() - interval '10 days' + interval '40 minutes',
     now() - interval '9 days', now() - interval '8 days', 12000)
  returning id into v_job;

  insert into public.reviews (job_id, worker_id, reviewer_id, rating, comment)
  values (v_job, v_worker, v_customer, 5, 'Quick, tidy and explained everything.');

  raise notice 'Demo data created. Remember to run embed-text for the service description.';
end;
$$;
