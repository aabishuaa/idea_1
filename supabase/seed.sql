-- MyB — LOCAL demo seed (loaded by `supabase db reset`; never run against prod).
-- Creates demo accounts (password for all: myb-demo-123), worker profiles,
-- jobs, and reviews so matching/reputation have data on first boot.
-- Hosted projects: create users through the app instead — see SETUP.md §4 and
-- seed_hosted_helpers.sql.
--
-- NOTE: service_descriptions.embedding stays NULL here (no LLM key in seed).
-- Run the embed-text function per service, or the ai-service ingest script,
-- to enable semantic ranking locally. Matching still works via filters.

-- ── Demo auth users ─────────────────────────────────────────────────────────
insert into auth.users
  (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
   raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
   confirmation_token, recovery_token, email_change, email_change_token_new)
values
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-8000-000000000001',
   'authenticated', 'authenticated', 'marcus@demo.myb',
   crypt('myb-demo-123', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{"full_name":"Marcus Anderson"}',
   now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-8000-000000000002',
   'authenticated', 'authenticated', 'sasha@demo.myb',
   crypt('myb-demo-123', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{"full_name":"Sasha King"}',
   now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-8000-000000000003',
   'authenticated', 'authenticated', 'devon@demo.myb',
   crypt('myb-demo-123', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{"full_name":"Devon Reid"}',
   now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-8000-000000000004',
   'authenticated', 'authenticated', 'brown@demo.myb',
   crypt('myb-demo-123', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{"full_name":"Miss Brown"}',
   now(), now(), '', '', '', '');

insert into auth.identities
  (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), u.id, u.id::text,
       jsonb_build_object('sub', u.id::text, 'email', u.email),
       'email', now(), now(), now()
  from auth.users u
 where u.email like '%@demo.myb';

-- Profiles were auto-created by the handle_new_user trigger; enrich them.
update public.profiles set is_worker = true, is_customer = true, parish = 'Kingston',
       identity_verified = true
 where id = '00000000-0000-4000-8000-000000000001';
update public.profiles set is_worker = true, parish = 'St. Andrew', identity_verified = true
 where id = '00000000-0000-4000-8000-000000000002';
update public.profiles set is_worker = true, parish = 'St. Catherine'
 where id = '00000000-0000-4000-8000-000000000003';
update public.profiles set is_customer = true, parish = 'St. Andrew'
 where id = '00000000-0000-4000-8000-000000000004';

-- ── Worker profiles ─────────────────────────────────────────────────────────
insert into public.worker_profiles
  (user_id, headline, bio, parish, location, years_experience,
   rate_min_jmd, rate_max_jmd, rate_unit, available)
values
  ('00000000-0000-4000-8000-000000000001',
   'Licensed electrician — residential & commercial',
   'Licensed electrician with 8+ years across residential and commercial jobs. Fast, tidy, guaranteed.',
   'Kingston', st_setsrid(st_makepoint(-76.7832, 17.9714), 4326)::geography,
   8, 3500, 3500, 'hour', true),
  ('00000000-0000-4000-8000-000000000002',
   'Plumber — leaks, installs, solar heaters',
   'Reliable plumbing for homes and small businesses: leak repair, pipe installation, bathroom fittings, solar water heaters.',
   'St. Andrew', st_setsrid(st_makepoint(-76.7500, 18.0333), 4326)::geography,
   6, 2900, 3200, 'hour', true),
  ('00000000-0000-4000-8000-000000000003',
   'Carpenter & cabinet maker',
   'Custom furniture, roofing frames, doors and windows. Spanish Town based, travels islandwide for big jobs.',
   'St. Catherine', st_setsrid(st_makepoint(-76.9574, 17.9911), 4326)::geography,
   4, 2400, 2400, 'hour', true);

insert into public.service_descriptions (user_id, trade_slug, title, description) values
  ('00000000-0000-4000-8000-000000000001', 'electrical', 'Wiring & rewiring',
   'House wiring, rewiring old installations, breaker panels, fixing outlets and switches, fault finding, solar panel hookup, electrical inspections.'),
  ('00000000-0000-4000-8000-000000000001', 'electrical', 'Solar installation',
   'Solar panel and inverter installation and maintenance for homes and shops, battery systems, grid tie-in.'),
  ('00000000-0000-4000-8000-000000000002', 'plumbing', 'Leak repair & pipe work',
   'Fixing leaking pipes, dripping taps, sinks and toilets, burst pipe emergency repair, water pump installation, low water pressure.'),
  ('00000000-0000-4000-8000-000000000003', 'carpentry', 'Custom furniture & repairs',
   'Custom cabinets, beds, doors, window frames, roof framing, furniture repair and refinishing.');

-- ── Completed jobs + reviews (reviews trigger reputation computation) ───────
insert into public.jobs
  (id, customer_id, worker_id, title, description, trade_slug, parish, urgency,
   status, requested_at, responded_at, started_at, completed_at, agreed_price_jmd)
values
  ('10000000-0000-4000-8000-000000000001',
   '00000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000001',
   'Rewire living room', 'Old wiring sparking at the socket.', 'electrical', 'St. Andrew',
   'high', 'completed', now() - interval '21 days', now() - interval '21 days' + interval '35 minutes',
   now() - interval '20 days', now() - interval '19 days', 12000),
  ('10000000-0000-4000-8000-000000000002',
   '00000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000001',
   'Install ceiling fans', 'Two ceiling fans for bedrooms.', 'electrical', 'St. Andrew',
   'normal', 'completed', now() - interval '12 days', now() - interval '12 days' + interval '2 hours',
   now() - interval '11 days', now() - interval '10 days', 8500),
  ('10000000-0000-4000-8000-000000000003',
   '00000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000002',
   'Fix kitchen sink leak', 'Pipe under the sink leaking bad.', 'plumbing', 'St. Andrew',
   'high', 'completed', now() - interval '8 days', now() - interval '8 days' + interval '50 minutes',
   now() - interval '7 days', now() - interval '7 days', 6000),
  ('10000000-0000-4000-8000-000000000004',
   '00000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000003',
   'Build kitchen cabinets', 'Small cabinet set over the counter.', 'carpentry', 'St. Catherine',
   'low', 'completed', now() - interval '30 days', now() - interval '29 days',
   now() - interval '28 days', now() - interval '25 days', 45000);

insert into public.reviews (job_id, worker_id, reviewer_id, rating, comment) values
  ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001',
   '00000000-0000-4000-8000-000000000004', 5, 'Quick, tidy and explained everything. Highly recommend.'),
  ('10000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001',
   '00000000-0000-4000-8000-000000000004', 5, 'Fans installed perfectly, no mess left behind.'),
  ('10000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000002',
   '00000000-0000-4000-8000-000000000004', 4, 'Leak fixed same day. Slight delay arriving but great work.'),
  ('10000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000003',
   '00000000-0000-4000-8000-000000000004', 5, 'Beautiful cabinets, exactly what we asked for.');

-- Demo chat thread.
insert into public.threads (id, customer_id, worker_id, job_id)
values ('20000000-0000-4000-8000-000000000001',
        '00000000-0000-4000-8000-000000000004',
        '00000000-0000-4000-8000-000000000001',
        '10000000-0000-4000-8000-000000000002');

insert into public.messages (thread_id, sender_id, body, created_at) values
  ('20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000004',
   'Morning! Are you able to come Saturday?', now() - interval '2 hours'),
  ('20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001',
   'Yes, Saturday works. I''ll reach for 10.', now() - interval '110 minutes'),
  ('20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001',
   'On my way 🚐 see you at 10', now() - interval '2 minutes');
