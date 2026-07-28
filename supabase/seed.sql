-- MyB — demo seed (loaded by `supabase db reset`; never run against prod).
--
-- Seeds 125 accounts (password for all: myb-demo-123): 113 workers across all
-- 12 trades and all 14 parishes, 644 jobs, 641 reviews, chats, notifications,
-- and formalization/verification state — so every screen has real content on
-- first boot.
--
-- HOW TO RUN (see SETUP.md §4):
--   Local stack : `supabase db reset` (loads this file automatically)
--   Hosted proj : paste this whole file into the SQL Editor and Run
--                 (after `supabase db push` has applied the migrations)
-- Safe to run twice: guarded inserts skip work that already exists.
--
-- Ratings, review counts, reputation and Top Pro tiers are NEVER written
-- directly — they are computed by the same SQL triggers the live app uses,
-- from the jobs and reviews inserted here.
--
-- Demo logins (password: myb-demo-123):
--   andre@demo.myb   — customer (the demo persona; richest customer view)
--   brown@demo.myb   — customer
--   rohan@demo.myb   — the featured pro from the mockups: 4.8 ★ (124), Kingston
--   marcus@demo.myb  — electrician, Top Pro, formalization suggested
--   sasha@demo.myb   — plumber, verified, formalization active
--   devon@demo.myb   — carpenter (unverified — shows the verification CTA)
--   worker001..100@demo.myb / customer01..10@demo.myb — the bulk population
--
-- NOTE: service_descriptions.embedding stays NULL here (no LLM key in seed).
-- Run the embed-text function per service, or the ai-service ingest script,
-- to enable semantic ranking. Matching still works via filters without it.

-- Hosted Supabase installs pgcrypto/postgis into the `extensions` schema;
-- a local stack puts them in `public`. Cover both so crypt()/st_makepoint()
-- resolve either way (a schema that does not exist is ignored).
set search_path = public, extensions;

-- The seed inserts ~640 jobs and reviews, each firing the reputation
-- triggers. Raise the timeout so the SQL Editor does not cut it off.
set statement_timeout = '600s';

-- ── Demo auth users ─────────────────────────────────────────────────────────
insert into auth.users
  (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
   raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
   confirmation_token, recovery_token, email_change, email_change_token_new)
select
  '00000000-0000-0000-0000-000000000000',
  ('00000000-0000-4000-8000-0000000000' || num)::uuid,
  'authenticated', 'authenticated', email,
  crypt('myb-demo-123', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}',
  jsonb_build_object('full_name', full_name),
  now(), now(), '', '', '', ''
from (values
  ('01', 'marcus@demo.myb',  'Marcus Anderson'),
  ('02', 'sasha@demo.myb',   'Sasha King'),
  ('03', 'devon@demo.myb',   'Devon Reid'),
  ('04', 'brown@demo.myb',   'Miss Brown'),
  ('05', 'andre@demo.myb',   'Andre Campbell'),
  ('06', 'tariq@demo.myb',   'Tariq Lewis'),
  ('07', 'keisha@demo.myb',  'Keisha Palmer'),
  ('08', 'omar@demo.myb',    'Omar Grant'),
  ('09', 'alicia@demo.myb',  'Alicia Chen'),
  ('10', 'dwayne@demo.myb',  'Dwayne Morris'),
  ('11', 'nadia@demo.myb',   'Nadia Simpson'),
  ('12', 'ricardo@demo.myb', 'Ricardo Bailey'),
  ('13', 'jerome@demo.myb',  'Jerome Clarke'),
  ('14', 'camille@demo.myb', 'Camille Roberts')
) as demo (num, email, full_name)
on conflict (id) do nothing;

insert into auth.identities
  (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), u.id, u.id::text,
       jsonb_build_object('sub', u.id::text, 'email', u.email),
       'email', now(), now(), now()
  from auth.users u
 where u.email like '%@demo.myb'
   and not exists (select 1 from auth.identities ai where ai.user_id = u.id);

-- Profiles were auto-created by the handle_new_user trigger; enrich them.
-- Customers.
update public.profiles set is_customer = true, parish = 'St. Andrew'
 where id in ('00000000-0000-4000-8000-000000000004',
              '00000000-0000-4000-8000-000000000005');

-- Workers (Marcus also hires; Devon stays unverified to demo the CTA).
update public.profiles set is_worker = true, is_customer = true, parish = 'Kingston',
       identity_verified = true
 where id = '00000000-0000-4000-8000-000000000001';
update public.profiles set is_worker = true, parish = 'St. Andrew', identity_verified = true
 where id = '00000000-0000-4000-8000-000000000002';
update public.profiles set is_worker = true, parish = 'St. Catherine'
 where id = '00000000-0000-4000-8000-000000000003';
update public.profiles set is_worker = true, parish = 'St. Catherine'
 where id = '00000000-0000-4000-8000-000000000006';
update public.profiles set is_worker = true, parish = 'Kingston', identity_verified = true
 where id = '00000000-0000-4000-8000-000000000007';
update public.profiles set is_worker = true, parish = 'St. James', identity_verified = true
 where id = '00000000-0000-4000-8000-000000000008';
update public.profiles set is_worker = true, parish = 'Manchester'
 where id = '00000000-0000-4000-8000-000000000009';
update public.profiles set is_worker = true, parish = 'Clarendon'
 where id = '00000000-0000-4000-8000-000000000010';
update public.profiles set is_worker = true, parish = 'St. Andrew', identity_verified = true
 where id = '00000000-0000-4000-8000-000000000011';
update public.profiles set is_worker = true, parish = 'St. Ann', identity_verified = true
 where id = '00000000-0000-4000-8000-000000000012';
update public.profiles set is_worker = true, parish = 'St. Catherine'
 where id = '00000000-0000-4000-8000-000000000013';
update public.profiles set is_worker = true, parish = 'Kingston'
 where id = '00000000-0000-4000-8000-000000000014';

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
   4, 2400, 2400, 'hour', true),
  ('00000000-0000-4000-8000-000000000006',
   'Electrician — fans, fixtures, small repairs',
   'Quick turnaround on household electrical: ceiling fans, light fixtures, sockets and small fault finding.',
   'St. Catherine', st_setsrid(st_makepoint(-76.9500, 18.0100), 4326)::geography,
   3, 2400, 2600, 'hour', true),
  ('00000000-0000-4000-8000-000000000007',
   'Painter — interiors, exteriors, decorative finishes',
   'Ten years painting homes and shops across Kingston. Clean lines, honest quotes, no half-done jobs.',
   'Kingston', st_setsrid(st_makepoint(-76.7900, 17.9800), 4326)::geography,
   10, 15000, 15000, 'day', true),
  ('00000000-0000-4000-8000-000000000008',
   'Auto mechanic — servicing, brakes, diagnostics',
   'MoBay-based mechanic: full servicing, brakes, suspension and computer diagnostics. Japanese and European models.',
   'St. James', st_setsrid(st_makepoint(-77.9184, 18.4712), 4326)::geography,
   12, 4000, 6000, 'job', true),
  ('00000000-0000-4000-8000-000000000009',
   'Tiler — floors, bathrooms, backsplashes',
   'Precision tiling for bathrooms, kitchens and verandas. Porcelain, ceramic and natural stone.',
   'Manchester', st_setsrid(st_makepoint(-77.5075, 18.0412), 4326)::geography,
   5, 3000, 3000, 'hour', true),
  ('00000000-0000-4000-8000-000000000010',
   'Mason — walls, foundations, decorative stonework',
   'Block walls, foundations, steps and decorative stonework. May Pen based, works across Clarendon and St. Catherine.',
   'Clarendon', st_setsrid(st_makepoint(-77.2418, 17.9645), 4326)::geography,
   15, 18000, 18000, 'day', true),
  ('00000000-0000-4000-8000-000000000011',
   'Landscaper — gardens, lawns, tree work',
   'Garden design, lawn care and tree trimming for homes and small hotels. Reliable weekly maintenance plans.',
   'St. Andrew', st_setsrid(st_makepoint(-76.7450, 18.0450), 4326)::geography,
   7, 12000, 12000, 'day', true),
  ('00000000-0000-4000-8000-000000000012',
   'AC & refrigeration technician',
   'Installation, servicing and repair of split units, fridges and cold rooms. Ocho Rios based, serves the north coast.',
   'St. Ann', st_setsrid(st_makepoint(-77.1032, 18.4076), 4326)::geography,
   9, 4500, 4500, 'job', true),
  ('00000000-0000-4000-8000-000000000013',
   'Appliance repair — washers, dryers, stoves',
   'Fixing washing machines, dryers, stoves and microwaves. Genuine parts where possible, honest advice always.',
   'St. Catherine', st_setsrid(st_makepoint(-76.9600, 17.9950), 4326)::geography,
   6, 3500, 3500, 'job', true),
  ('00000000-0000-4000-8000-000000000014',
   'Welder & fabricator — grills, gates, rails',
   'Custom window grills, gates, stair rails and trailer repair. Mobile welding available islandwide.',
   'Kingston', st_setsrid(st_makepoint(-76.8000, 17.9750), 4326)::geography,
   8, 5000, 8000, 'job', true)
on conflict (user_id) do nothing;

insert into public.service_descriptions (user_id, trade_slug, title, description) values
  ('00000000-0000-4000-8000-000000000001', 'electrical', 'Wiring & rewiring',
   'House wiring, rewiring old installations, breaker panels, fixing outlets and switches, fault finding, solar panel hookup, electrical inspections.'),
  ('00000000-0000-4000-8000-000000000001', 'electrical', 'Solar installation',
   'Solar panel and inverter installation and maintenance for homes and shops, battery systems, grid tie-in.'),
  ('00000000-0000-4000-8000-000000000002', 'plumbing', 'Leak repair & pipe work',
   'Fixing leaking pipes, dripping taps, sinks and toilets, burst pipe emergency repair, water pump installation, low water pressure.'),
  ('00000000-0000-4000-8000-000000000003', 'carpentry', 'Custom furniture & repairs',
   'Custom cabinets, beds, doors, window frames, roof framing, furniture repair and refinishing.'),
  ('00000000-0000-4000-8000-000000000006', 'electrical', 'Fans, fixtures & sockets',
   'Ceiling fan installation, light fixtures, new sockets and switches, small electrical repairs and fault finding.'),
  ('00000000-0000-4000-8000-000000000007', 'painting', 'Interior & exterior painting',
   'Room painting, exterior walls, gates and grills, skim coating, decorative finishes, colour advice.'),
  ('00000000-0000-4000-8000-000000000008', 'mechanics', 'Servicing & diagnostics',
   'Full vehicle servicing, oil change, brake pads and discs, suspension work, engine diagnostics, pre-purchase inspection.'),
  ('00000000-0000-4000-8000-000000000009', 'tiling', 'Floor & bathroom tiling',
   'Bathroom walls and floors, kitchen backsplash, veranda and living room tiles, regrouting and repair.'),
  ('00000000-0000-4000-8000-000000000010', 'masonry', 'Walls, steps & foundations',
   'Block work, retaining walls, house foundations, concrete steps, plastering and decorative stonework.'),
  ('00000000-0000-4000-8000-000000000011', 'landscaping', 'Garden & lawn care',
   'Lawn cutting, hedge trimming, tree pruning, garden beds, irrigation setup, weekly yard maintenance.'),
  ('00000000-0000-4000-8000-000000000012', 'ac-refrigeration', 'AC install & servicing',
   'Split unit AC installation and servicing, gas top-up, fridge and freezer repair, cold room maintenance.'),
  ('00000000-0000-4000-8000-000000000013', 'appliance-repair', 'Washer & stove repair',
   'Washing machine repair, dryer repair, stove and oven elements, microwave faults, spare parts sourcing.'),
  ('00000000-0000-4000-8000-000000000014', 'welding', 'Grills, gates & rails',
   'Custom window grills, driveway gates, stair and balcony rails, welding repairs, mobile service.');

-- ── Completed jobs + reviews (reviews trigger reputation computation) ───────
-- Customers: 04 = Miss Brown, 05 = Andre Campbell.
insert into public.jobs
  (id, customer_id, worker_id, title, description, trade_slug, parish, urgency,
   status, requested_at, responded_at, started_at, completed_at, agreed_price_jmd)
values
  -- Marcus (electrician) — 5 completed jobs → earns Top Pro naturally.
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
  ('10000000-0000-4000-8000-000000000005',
   '00000000-0000-4000-8000-000000000005', '00000000-0000-4000-8000-000000000001',
   'Rewire shop counter area', 'New sockets and breaker for a small shop.', 'electrical', 'Kingston',
   'normal', 'completed', now() - interval '45 days', now() - interval '45 days' + interval '1 hour',
   now() - interval '44 days', now() - interval '42 days', 22000),
  ('10000000-0000-4000-8000-000000000006',
   '00000000-0000-4000-8000-000000000005', '00000000-0000-4000-8000-000000000001',
   'Install outdoor security lights', 'Four motion-sensor lights around the yard.', 'electrical', 'St. Andrew',
   'low', 'completed', now() - interval '33 days', now() - interval '33 days' + interval '3 hours',
   now() - interval '31 days', now() - interval '30 days', 14000),
  ('10000000-0000-4000-8000-000000000007',
   '00000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000001',
   'Fix tripping breaker', 'Main breaker trips when the microwave runs.', 'electrical', 'St. Andrew',
   'high', 'completed', now() - interval '6 days', now() - interval '6 days' + interval '25 minutes',
   now() - interval '5 days', now() - interval '5 days', 6500),

  -- Sasha (plumber).
  ('10000000-0000-4000-8000-000000000003',
   '00000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000002',
   'Fix kitchen sink leak', 'Pipe under the sink leaking bad.', 'plumbing', 'St. Andrew',
   'high', 'completed', now() - interval '8 days', now() - interval '8 days' + interval '50 minutes',
   now() - interval '7 days', now() - interval '7 days', 6000),
  ('10000000-0000-4000-8000-000000000008',
   '00000000-0000-4000-8000-000000000005', '00000000-0000-4000-8000-000000000002',
   'Replace bathroom tap', 'Old tap dripping non-stop, wasting water.', 'plumbing', 'St. Andrew',
   'normal', 'completed', now() - interval '15 days', now() - interval '15 days' + interval '40 minutes',
   now() - interval '14 days', now() - interval '14 days', 4500),

  -- Devon (carpenter).
  ('10000000-0000-4000-8000-000000000004',
   '00000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000003',
   'Build kitchen cabinets', 'Small cabinet set over the counter.', 'carpentry', 'St. Catherine',
   'low', 'completed', now() - interval '30 days', now() - interval '29 days',
   now() - interval '28 days', now() - interval '25 days', 45000),
  ('10000000-0000-4000-8000-000000000009',
   '00000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000003',
   'Repair door frame', 'Front door frame rotting at the base.', 'carpentry', 'St. Andrew',
   'normal', 'completed', now() - interval '9 days', now() - interval '9 days' + interval '4 hours',
   now() - interval '8 days', now() - interval '8 days', 9000),

  -- Tariq (electrician, newer).
  ('10000000-0000-4000-8000-000000000010',
   '00000000-0000-4000-8000-000000000005', '00000000-0000-4000-8000-000000000006',
   'Install ceiling fan', 'One fan for the back bedroom.', 'electrical', 'St. Andrew',
   'low', 'completed', now() - interval '18 days', now() - interval '18 days' + interval '5 hours',
   now() - interval '17 days', now() - interval '17 days', 5000),

  -- Keisha (painter).
  ('10000000-0000-4000-8000-000000000011',
   '00000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000007',
   'Paint living room & hall', 'Two rooms, ceiling included, we supply paint.', 'painting', 'St. Andrew',
   'normal', 'completed', now() - interval '25 days', now() - interval '25 days' + interval '2 hours',
   now() - interval '23 days', now() - interval '21 days', 30000),
  ('10000000-0000-4000-8000-000000000012',
   '00000000-0000-4000-8000-000000000005', '00000000-0000-4000-8000-000000000007',
   'Paint veranda and grills', 'Veranda walls plus rails and window grills.', 'painting', 'St. Andrew',
   'low', 'completed', now() - interval '11 days', now() - interval '11 days' + interval '6 hours',
   now() - interval '9 days', now() - interval '8 days', 18000),

  -- Omar (mechanic).
  ('10000000-0000-4000-8000-000000000013',
   '00000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000008',
   'Full car service', 'Probox due for service, pulling slightly right.', 'mechanics', 'St. James',
   'normal', 'completed', now() - interval '40 days', now() - interval '40 days' + interval '1 hour',
   now() - interval '38 days', now() - interval '38 days', 18000),
  ('10000000-0000-4000-8000-000000000014',
   '00000000-0000-4000-8000-000000000005', '00000000-0000-4000-8000-000000000008',
   'Replace brake pads', 'Grinding sound when braking.', 'mechanics', 'St. James',
   'high', 'completed', now() - interval '16 days', now() - interval '16 days' + interval '30 minutes',
   now() - interval '15 days', now() - interval '15 days', 12000),

  -- Alicia (tiler), Dwayne (mason), Nadia (landscaper), Ricardo (AC),
  -- Jerome (appliance), Camille (welder) — one completed job each.
  ('10000000-0000-4000-8000-000000000015',
   '00000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000009',
   'Tile bathroom walls', 'Retile the shower area, tiles on site.', 'tiling', 'Manchester',
   'normal', 'completed', now() - interval '28 days', now() - interval '27 days',
   now() - interval '26 days', now() - interval '24 days', 26000),
  ('10000000-0000-4000-8000-000000000016',
   '00000000-0000-4000-8000-000000000005', '00000000-0000-4000-8000-000000000010',
   'Build garden wall', 'Low block wall along the front fence line.', 'masonry', 'St. Andrew',
   'low', 'completed', now() - interval '50 days', now() - interval '49 days',
   now() - interval '48 days', now() - interval '44 days', 60000),
  ('10000000-0000-4000-8000-000000000017',
   '00000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000011',
   'Yard cleanup & hedge trim', 'Full yard tidy before a family event.', 'landscaping', 'St. Andrew',
   'normal', 'completed', now() - interval '13 days', now() - interval '13 days' + interval '2 hours',
   now() - interval '12 days', now() - interval '12 days', 14000),
  ('10000000-0000-4000-8000-000000000018',
   '00000000-0000-4000-8000-000000000005', '00000000-0000-4000-8000-000000000012',
   'Service two AC units', 'Split units in bedroom and shop need cleaning and gas.', 'ac-refrigeration', 'St. Ann',
   'normal', 'completed', now() - interval '22 days', now() - interval '22 days' + interval '1 hour',
   now() - interval '21 days', now() - interval '21 days', 16000),
  ('10000000-0000-4000-8000-000000000019',
   '00000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000013',
   'Fix washing machine', 'Machine fills but the drum will not spin.', 'appliance-repair', 'St. Andrew',
   'high', 'completed', now() - interval '7 days', now() - interval '7 days' + interval '45 minutes',
   now() - interval '6 days', now() - interval '6 days', 8000),
  ('10000000-0000-4000-8000-000000000020',
   '00000000-0000-4000-8000-000000000005', '00000000-0000-4000-8000-000000000014',
   'Weld new window grills', 'Three window grills, simple pattern.', 'welding', 'Kingston',
   'normal', 'completed', now() - interval '35 days', now() - interval '34 days',
   now() - interval '33 days', now() - interval '30 days', 42000),

  -- Live bookings for the demo (no reviews yet): Andre's home + bookings tabs.
  ('10000000-0000-4000-8000-000000000021',
   '00000000-0000-4000-8000-000000000005', '00000000-0000-4000-8000-000000000002',
   'Fix leaking pipe', 'Pipe joint under the kitchen counter dripping.', 'plumbing', 'St. Andrew',
   'high', 'accepted', now() - interval '1 day', now() - interval '20 hours',
   null, null, 6000),
  ('10000000-0000-4000-8000-000000000022',
   '00000000-0000-4000-8000-000000000005', '00000000-0000-4000-8000-000000000006',
   'Install light fixture', 'New pendant light for the dining area.', 'electrical', 'St. Catherine',
   'normal', 'requested', now() - interval '5 hours', null, null, null, null),
  ('10000000-0000-4000-8000-000000000023',
   '00000000-0000-4000-8000-000000000005', '00000000-0000-4000-8000-000000000001',
   'Rewire kitchen outlets', 'Add two double sockets over the counter.', 'electrical', 'St. Andrew',
   'normal', 'in_progress', now() - interval '3 days', now() - interval '3 days' + interval '1 hour',
   now() - interval '1 day', null, 15000)
on conflict (id) do nothing;

insert into public.reviews (job_id, worker_id, reviewer_id, rating, comment) values
  ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001',
   '00000000-0000-4000-8000-000000000004', 5, 'Quick, tidy and explained everything. Highly recommend.'),
  ('10000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001',
   '00000000-0000-4000-8000-000000000004', 5, 'Fans installed perfectly, no mess left behind.'),
  ('10000000-0000-4000-8000-000000000005', '00000000-0000-4000-8000-000000000001',
   '00000000-0000-4000-8000-000000000005', 5, 'Shop wiring done professionally and passed inspection first time.'),
  ('10000000-0000-4000-8000-000000000006', '00000000-0000-4000-8000-000000000001',
   '00000000-0000-4000-8000-000000000005', 5, 'Security lights work great. Punctual both days.'),
  ('10000000-0000-4000-8000-000000000007', '00000000-0000-4000-8000-000000000001',
   '00000000-0000-4000-8000-000000000004', 4, 'Found the fault fast. Arrived a little late but called ahead.'),
  ('10000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000002',
   '00000000-0000-4000-8000-000000000004', 4, 'Leak fixed same day. Slight delay arriving but great work.'),
  ('10000000-0000-4000-8000-000000000008', '00000000-0000-4000-8000-000000000002',
   '00000000-0000-4000-8000-000000000005', 5, 'New tap in under an hour, no more dripping. Very professional.'),
  ('10000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000003',
   '00000000-0000-4000-8000-000000000004', 5, 'Beautiful cabinets, exactly what we asked for.'),
  ('10000000-0000-4000-8000-000000000009', '00000000-0000-4000-8000-000000000003',
   '00000000-0000-4000-8000-000000000004', 5, 'Door frame solid again — matched the wood perfectly.'),
  ('10000000-0000-4000-8000-000000000010', '00000000-0000-4000-8000-000000000006',
   '00000000-0000-4000-8000-000000000005', 4, 'Fan works well. Took a bit longer than quoted.'),
  ('10000000-0000-4000-8000-000000000011', '00000000-0000-4000-8000-000000000007',
   '00000000-0000-4000-8000-000000000004', 5, 'Walls look brand new, edges razor sharp. Worth every dollar.'),
  ('10000000-0000-4000-8000-000000000012', '00000000-0000-4000-8000-000000000007',
   '00000000-0000-4000-8000-000000000005', 4, 'Veranda looks great. Grills needed a second coat but she came back.'),
  ('10000000-0000-4000-8000-000000000013', '00000000-0000-4000-8000-000000000008',
   '00000000-0000-4000-8000-000000000004', 5, 'Car drives straight again. Honest about what did NOT need fixing.'),
  ('10000000-0000-4000-8000-000000000014', '00000000-0000-4000-8000-000000000008',
   '00000000-0000-4000-8000-000000000005', 5, 'Brakes feel new. Showed me the worn pads before replacing.'),
  ('10000000-0000-4000-8000-000000000015', '00000000-0000-4000-8000-000000000009',
   '00000000-0000-4000-8000-000000000004', 4, 'Neat lines and level tiles. Cleanup could be better.'),
  ('10000000-0000-4000-8000-000000000016', '00000000-0000-4000-8000-000000000010',
   '00000000-0000-4000-8000-000000000005', 5, 'Wall straight and strong, finished ahead of schedule.'),
  ('10000000-0000-4000-8000-000000000017', '00000000-0000-4000-8000-000000000011',
   '00000000-0000-4000-8000-000000000004', 5, 'Yard never looked so good. Booked her monthly after this.'),
  ('10000000-0000-4000-8000-000000000018', '00000000-0000-4000-8000-000000000012',
   '00000000-0000-4000-8000-000000000005', 5, 'Both units blowing cold again. Explained the maintenance schedule.'),
  ('10000000-0000-4000-8000-000000000019', '00000000-0000-4000-8000-000000000013',
   '00000000-0000-4000-8000-000000000004', 4, 'Machine spinning again. Part took a day to source.'),
  ('10000000-0000-4000-8000-000000000020', '00000000-0000-4000-8000-000000000014',
   '00000000-0000-4000-8000-000000000005', 5, 'Grills look excellent and fit perfectly. True professional.')
on conflict (job_id) do nothing;

-- ── Chats ───────────────────────────────────────────────────────────────────
insert into public.threads (id, customer_id, worker_id, job_id) values
  ('20000000-0000-4000-8000-000000000001',
   '00000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000001',
   '10000000-0000-4000-8000-000000000002'),
  ('20000000-0000-4000-8000-000000000002',
   '00000000-0000-4000-8000-000000000005', '00000000-0000-4000-8000-000000000002',
   '10000000-0000-4000-8000-000000000021'),
  ('20000000-0000-4000-8000-000000000003',
   '00000000-0000-4000-8000-000000000005', '00000000-0000-4000-8000-000000000006',
   '10000000-0000-4000-8000-000000000022')
on conflict (id) do nothing;

insert into public.messages (thread_id, sender_id, body, created_at) values
  ('20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000004',
   'Morning! Are you able to come Saturday?', now() - interval '2 hours'),
  ('20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001',
   'Yes, Saturday works. I''ll reach for 10.', now() - interval '110 minutes'),
  ('20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001',
   'On my way 🚐 see you at 10', now() - interval '2 minutes'),
  ('20000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000005',
   'Hi Sasha, the pipe under the counter is dripping worse today.', now() - interval '22 hours'),
  ('20000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000002',
   'No problem — I can pass by tomorrow at 2. Shut off the valve under the sink for now.', now() - interval '20 hours'),
  ('20000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000002',
   'Confirmed for 2 PM tomorrow 👍', now() - interval '30 minutes'),
  ('20000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000005',
   'Sent you a request for a pendant light install — is this week possible?', now() - interval '5 hours');

-- ── Notifications ───────────────────────────────────────────────────────────
insert into public.notifications (user_id, type, title, body, data) values
  -- Auto-suggest card on Marcus' home (FR-BIZ-6: suggest, never enroll).
  ('00000000-0000-4000-8000-000000000001', 'formalization_suggestion',
   'Ready to make it official?',
   'Five jobs completed at 4.8★ — you qualify to start the formalization pathway.',
   '{"source":"auto_trigger"}'),
  ('00000000-0000-4000-8000-000000000005', 'job_status',
   'Booking confirmed',
   'Sasha King confirmed "Fix leaking pipe" for tomorrow 2:00 PM.',
   '{"job_id":"10000000-0000-4000-8000-000000000021"}');

-- ── Formalization state ─────────────────────────────────────────────────────
-- Marcus: suggested (auto-trigger fired, waiting on his confirmation).
insert into public.formalization_progress (user_id, status, suggested_at, activation_mode)
values ('00000000-0000-4000-8000-000000000001', 'suggested', now() - interval '1 day', 'auto_suggested')
on conflict (user_id) do nothing;

-- Sasha: opted in manually, two steps done already.
insert into public.formalization_progress
  (user_id, status, activated_at, activation_mode, readiness_score, answers)
values ('00000000-0000-4000-8000-000000000002', 'active', now() - interval '10 days', 'manual', 11,
        '{"1":"Yes","2":"Yes","3":"Sometimes","4":"More than 2 years","5":"Thinking about it","6":"Yes","7":"Yes","8":"Sometimes"}')
on conflict (user_id) do nothing;

insert into public.checklist_progress (user_id, item_id, done, done_at) values
  ('00000000-0000-4000-8000-000000000002', 1, true, now() - interval '8 days'),
  ('00000000-0000-4000-8000-000000000002', 2, true, now() - interval '5 days')
on conflict (user_id, item_id) do nothing;

-- ═══════════════════════════════════════════════════════════════════════════
-- BULK DEMO POPULATION — 100 workers + 10 customers, generated deterministically
-- ═══════════════════════════════════════════════════════════════════════════
-- Everything below is derived from the loop counter (no random()), so the same
-- data appears on every machine. Reputation, ratings and job counts are NOT
-- written directly — they come out of the same triggers the live app uses, by
-- inserting real jobs and reviews.
-- Safe to re-run: the guard skips the whole block if it already ran.

do $$
declare
  v_first text[] := array[
    'Andre','Kemar','Shanice','Rohan','Tashana','Delroy','Oneil','Shantel','Damion','Kimberly',
    'Rayon','Alicia','Everton','Georgia','Jermaine','Latoya','Kirk','Novia','Dwight','Simone',
    'Courtney','Racquel','Fabian','Yanique','Garfield','Sanya','Leroy','Chevonne','Winston','Paula',
    'Marlon','Kadian','Trevor','Ainsley','Denise','Horace','Michelle','Clive','Judith','Rohan'];
  v_last text[] := array[
    'Brown','Campbell','Williams','Grant','Palmer','Reid','Bailey','Clarke','Morris','Simpson',
    'Roberts','Lewis','Chen','Thompson','Walker','Henry','Gordon','Facey','McKenzie','Blake',
    'Sinclair','Dixon','Wright','Barrett','Ellis'];
  v_trades text[] := array[
    'plumbing','electrical','carpentry','painting','masonry','tiling',
    'welding','mechanics','appliance-repair','landscaping','ac-refrigeration','roofing'];
  v_headline text[] := array[
    'Plumber — leaks, installs & repairs',
    'Electrician — wiring, fixtures & faults',
    'Carpenter — furniture, doors & framing',
    'Painter — interiors, exteriors & finishes',
    'Mason — walls, steps & foundations',
    'Tiler — floors, bathrooms & backsplashes',
    'Welder — grills, gates & rails',
    'Auto mechanic — servicing & diagnostics',
    'Appliance repair — washers, stoves & fridges',
    'Landscaper — gardens, lawns & tree work',
    'AC & refrigeration technician',
    'Roofer — repairs, sheeting & guttering'];
  v_service_title text[] := array[
    'Leak repair & pipe work','Wiring & electrical repairs','Custom furniture & repairs',
    'Interior & exterior painting','Block work & foundations','Floor & bathroom tiling',
    'Grills, gates & rails','Servicing & diagnostics','Washer & stove repair',
    'Garden & lawn care','AC install & servicing','Roof repair & replacement'];
  v_service_desc text[] := array[
    'Fixing leaking pipes, dripping taps, sinks and toilets, burst pipe emergency repair, water pump installation, low water pressure.',
    'House wiring, rewiring, breaker panels, outlets and switches, fault finding, ceiling fans, security lights.',
    'Custom cabinets, beds, doors, window frames, roof framing, furniture repair and refinishing.',
    'Room painting, exterior walls, gates and grills, skim coating, decorative finishes, colour advice.',
    'Block work, retaining walls, house foundations, concrete steps, plastering and decorative stonework.',
    'Bathroom walls and floors, kitchen backsplash, veranda and living room tiles, regrouting and repair.',
    'Custom window grills, driveway gates, stair and balcony rails, welding repairs, mobile service.',
    'Full vehicle servicing, oil change, brakes, suspension work, engine diagnostics, pre-purchase inspection.',
    'Washing machine repair, dryer repair, stove and oven elements, microwave faults, spare parts sourcing.',
    'Lawn cutting, hedge trimming, tree pruning, garden beds, irrigation setup, weekly yard maintenance.',
    'Split unit AC installation and servicing, gas top-up, fridge and freezer repair, cold room maintenance.',
    'Roof leak repair, zinc and shingle replacement, guttering, ridge capping, roof inspection.'];
  v_job_title text[] := array[
    'Fix leaking pipe','Replace light fixtures','Build kitchen cabinets','Paint two bedrooms',
    'Build boundary wall','Tile bathroom floor','Weld window grills','Full car service',
    'Repair washing machine','Yard cleanup & trim','Service AC unit','Repair roof leak'];
  v_comment text[] := array[
    'Excellent work, arrived on time and cleaned up after.',
    'Very professional and fair with the price. Would hire again.',
    'Did the job properly and explained everything clearly.',
    'Good work overall, took a little longer than expected.',
    'Solid job. Communicated well throughout.',
    'Quick response and quality finish. Recommended.',
    'Honest about what was needed — no upselling.',
    'Neat work and reasonable rate. Happy with it.'];
  v_parishes text[] := array[
    'Kingston','St. Andrew','St. Catherine','St. James','Manchester','Clarendon','St. Ann',
    'Portland','St. Thomas','St. Mary','Trelawny','Hanover','Westmoreland','St. Elizabeth'];

  v_customers uuid[] := '{}';
  v_worker    uuid;
  v_customer  uuid;
  v_job       uuid;
  v_trade_ix  int;
  v_trade     text;
  v_parish    text;
  v_location  geography;
  v_unit      text;
  v_rate      numeric;
  v_jobs      int;
  v_rating    int;
  v_days      int;
  i int;
  k int;
begin
  if exists (select 1 from auth.users where email like 'worker0%@demo.myb') then
    raise notice 'Bulk demo users already present — skipping generation.';
    return;
  end if;

  -- ── 10 generated customers ────────────────────────────────────────────────
  for i in 1..10 loop
    v_customer := ('00000000-0000-4000-a000-' || lpad(i::text, 12, '0'))::uuid;

    insert into auth.users
      (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
       raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
       confirmation_token, recovery_token, email_change, email_change_token_new)
    values
      ('00000000-0000-0000-0000-000000000000', v_customer, 'authenticated', 'authenticated',
       'customer' || lpad(i::text, 2, '0') || '@demo.myb',
       crypt('myb-demo-123', gen_salt('bf')), now(),
       '{"provider":"email","providers":["email"]}',
       jsonb_build_object('full_name',
         v_first[1 + ((i * 5) % array_length(v_first, 1))] || ' ' ||
         v_last[1 + ((i * 3) % array_length(v_last, 1))]),
       now(), now(), '', '', '', '');

    update public.profiles
       set is_customer = true,
           parish = v_parishes[1 + (i % array_length(v_parishes, 1))]
     where id = v_customer;

    v_customers := v_customers || v_customer;
  end loop;

  -- ── 100 generated workers ─────────────────────────────────────────────────
  for i in 1..100 loop
    v_worker := ('00000000-0000-4000-9000-' || lpad(i::text, 12, '0'))::uuid;
    v_trade_ix := 1 + (i % array_length(v_trades, 1));
    v_trade := v_trades[v_trade_ix];
    v_parish := v_parishes[1 + (i % array_length(v_parishes, 1))];

    insert into auth.users
      (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
       raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
       confirmation_token, recovery_token, email_change, email_change_token_new)
    values
      ('00000000-0000-0000-0000-000000000000', v_worker, 'authenticated', 'authenticated',
       'worker' || lpad(i::text, 3, '0') || '@demo.myb',
       crypt('myb-demo-123', gen_salt('bf')), now(),
       '{"provider":"email","providers":["email"]}',
       jsonb_build_object('full_name',
         v_first[1 + (i % array_length(v_first, 1))] || ' ' ||
         v_last[1 + ((i * 7) % array_length(v_last, 1))]),
       now(), now(), '', '', '', '');

    -- ~2 in 3 verified, so the app shows both verified and unverified pros.
    update public.profiles
       set is_worker = true,
           parish = v_parish,
           identity_verified = (i % 3) <> 0
     where id = v_worker;

    -- Position: parish centroid, nudged so pros spread out on the map.
    select st_setsrid(
             st_makepoint(
               st_x(p.centroid::geometry) + (((i % 7) - 3) * 0.012),
               st_y(p.centroid::geometry) + (((i % 5) - 2) * 0.012)),
             4326)::geography
      into v_location
      from public.parishes p
     where p.country = 'JM' and p.name = v_parish;

    v_unit := case
                when v_trade in ('painting', 'masonry', 'landscaping') then 'day'
                when v_trade in ('mechanics', 'ac-refrigeration', 'appliance-repair', 'welding')
                  then 'job'
                else 'hour'
              end;
    v_rate := case v_unit
                when 'hour' then 2000 + (i % 9) * 250
                when 'day'  then 10000 + (i % 8) * 1500
                else 3500 + (i % 10) * 500
              end;

    insert into public.worker_profiles
      (user_id, headline, bio, parish, location, years_experience,
       rate_min_jmd, rate_max_jmd, rate_unit, available)
    values
      (v_worker, v_headline[v_trade_ix],
       v_service_desc[v_trade_ix] || ' Based in ' || v_parish ||
         ', serving surrounding communities.',
       v_parish, v_location, 1 + (i % 18),
       v_rate, v_rate + (i % 4) * 250, v_unit, (i % 8) <> 0);

    insert into public.service_descriptions (user_id, trade_slug, title, description)
    values (v_worker, v_trade, v_service_title[v_trade_ix], v_service_desc[v_trade_ix]);

    -- 1–9 completed jobs each, every one reviewed. The reviews/jobs triggers
    -- compute reputation, rating_avg and jobs_completed from these rows.
    v_jobs := 1 + (i % 9);
    for k in 1..v_jobs loop
      v_job := gen_random_uuid();
      v_customer := v_customers[1 + ((i + k) % 10)];
      v_days := 5 + ((i * 3 + k * 7) % 85);

      insert into public.jobs
        (id, customer_id, worker_id, title, description, trade_slug, parish, urgency,
         status, requested_at, responded_at, started_at, completed_at, agreed_price_jmd)
      values
        (v_job, v_customer, v_worker, v_job_title[v_trade_ix],
         'Demo job seeded for ' || v_trade || ' in ' || v_parish || '.',
         v_trade, v_parish,
         (array['low', 'normal', 'normal', 'high'])[1 + ((i + k) % 4)]::public.job_urgency,
         'completed',
         now() - (v_days || ' days')::interval,
         now() - (v_days || ' days')::interval + interval '2 hours',
         now() - ((v_days - 1) || ' days')::interval,
         now() - ((v_days - 2) || ' days')::interval,
         v_rate * (1 + (k % 3)));

      -- Mostly 4–5★ with the occasional 3★, so rankings differ believably.
      v_rating := case
                    when (i + k) % 11 = 0 then 3
                    when (i + k) % 4 = 0 then 4
                    else 5
                  end;

      insert into public.reviews (job_id, worker_id, reviewer_id, rating, comment)
      values (v_job, v_worker, v_customer, v_rating,
              v_comment[1 + ((i + k) % array_length(v_comment, 1))]);
    end loop;
  end loop;

  raise notice 'Seeded 100 demo workers + 10 demo customers.';
end $$;

-- ── Rohan Williams — the featured pro from the design mockups ───────────────
-- "Rohan Williams · Plumbing Specialist · 4.8 (124) · Kingston · Top Pro".
-- His 124 completed jobs and reviews are inserted for real, so the rating,
-- review count and reputation on screen are all trigger-computed.
insert into auth.users
  (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
   raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
   confirmation_token, recovery_token, email_change, email_change_token_new)
values
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-8000-000000000015',
   'authenticated', 'authenticated', 'rohan@demo.myb',
   crypt('myb-demo-123', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{"full_name":"Rohan Williams"}',
   now(), now(), '', '', '', '')
on conflict (id) do nothing;

update public.profiles
   set is_worker = true, parish = 'Kingston', identity_verified = true
 where id = '00000000-0000-4000-8000-000000000015';

insert into public.worker_profiles
  (user_id, headline, bio, parish, location, years_experience,
   rate_min_jmd, rate_max_jmd, rate_unit, available)
values
  ('00000000-0000-4000-8000-000000000015',
   'Plumbing Specialist',
   'Kingston''s go-to plumber for over a decade — leak repair, pipe fitting, bathroom and kitchen installs. Same-day emergency callouts across the corporate area.',
   'Kingston', st_setsrid(st_makepoint(-76.7920, 17.9770), 4326)::geography,
   12, 3500, 4500, 'hour', true)
on conflict (user_id) do nothing;

insert into public.service_descriptions (user_id, trade_slug, title, description)
select '00000000-0000-4000-8000-000000000015', 'plumbing', title, description
  from (values
    ('Leak repair', 'Emergency leak repair, burst pipes, dripping taps, running toilets, water damage prevention.'),
    ('Pipe fitting', 'New pipe runs, repiping old houses, water tank and pump connections, PVC and copper fitting.'),
    ('Bathroom & kitchen installs', 'Sink, toilet, shower and bathtub installation, kitchen plumbing, solar water heater hookup.')
  ) as s (title, description)
 where not exists (
   select 1 from public.service_descriptions
    where user_id = '00000000-0000-4000-8000-000000000015');

do $$
declare
  v_rohan uuid := '00000000-0000-4000-8000-000000000015';
  v_customers uuid[];
  v_job uuid;
  v_days int;
  i int;
begin
  if (select count(*) from public.jobs where worker_id = v_rohan) > 0 then
    raise notice 'Rohan already has job history — skipping.';
    return;
  end if;

  select array_agg(id) into v_customers from (
    select id from public.profiles where is_customer and id <> v_rohan order by id limit 20
  ) c;

  -- 124 completed + reviewed jobs → rating_avg 4.8, rating_count 124.
  for i in 1..124 loop
    v_job := gen_random_uuid();
    v_days := 10 + (i * 5) % 350;

    insert into public.jobs
      (id, customer_id, worker_id, title, description, trade_slug, parish, urgency,
       status, requested_at, responded_at, started_at, completed_at, agreed_price_jmd)
    values
      (v_job, v_customers[1 + (i % array_length(v_customers, 1))], v_rohan,
       (array['Fix leaking pipe', 'Install bathroom sink', 'Unblock kitchen drain',
              'Replace water heater', 'Repipe bathroom', 'Fix running toilet'])[1 + (i % 6)],
       'Plumbing work completed in Kingston.', 'plumbing', 'Kingston',
       (array['low', 'normal', 'normal', 'high'])[1 + (i % 4)]::public.job_urgency,
       'completed',
       now() - (v_days || ' days')::interval,
       now() - (v_days || ' days')::interval + interval '15 minutes',
       now() - ((v_days - 1) || ' days')::interval,
       now() - ((v_days - 1) || ' days')::interval,
       4500 + (i % 8) * 750);

    insert into public.reviews (job_id, worker_id, reviewer_id, rating, comment)
    values (v_job, v_rohan, v_customers[1 + (i % array_length(v_customers, 1))],
            case when i % 5 = 0 then 4 else 5 end,
            (array[
              'Fast, clean and fairly priced. The best plumber I''ve used.',
              'Came out same day for an emergency leak. Lifesaver.',
              'Explained the problem clearly and fixed it properly the first time.',
              'Very tidy work and no mess left behind. Highly recommend.',
              'Reliable and professional — my go-to plumber now.'
            ])[1 + (i % 5)]);
  end loop;

  raise notice 'Seeded Rohan Williams with 124 completed jobs.';
end $$;

-- Auth identities for every demo user created above (the named cast already
-- has theirs; this covers the generated accounts).
insert into auth.identities
  (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), u.id, u.id::text,
       jsonb_build_object('sub', u.id::text, 'email', u.email),
       'email', now(), now(), now()
  from auth.users u
 where u.email like '%@demo.myb'
   and not exists (select 1 from auth.identities ai where ai.user_id = u.id);

-- ── Saved pros + notification history for the demo customer ────────────────
-- Andre saves the pros he has hired, so Favourites is populated on first open.
insert into public.favorites (user_id, worker_id, created_at)
values
  ('00000000-0000-4000-8000-000000000005', '00000000-0000-4000-8000-000000000015', now() - interval '3 days'),
  ('00000000-0000-4000-8000-000000000005', '00000000-0000-4000-8000-000000000002', now() - interval '9 days'),
  ('00000000-0000-4000-8000-000000000005', '00000000-0000-4000-8000-000000000001', now() - interval '20 days'),
  ('00000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000007', now() - interval '15 days'),
  ('00000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000015', now() - interval '2 days')
on conflict (user_id, worker_id) do nothing;

-- A few notifications so the header bell and the notification centre have
-- something to show (the jobs triggers generate the rest).
insert into public.notifications (user_id, type, title, body, data, created_at, read_at)
select '00000000-0000-4000-8000-000000000005', kind::text, title, body, '{}'::jsonb, created_at, read_at
  from (values
    ('new_message', 'New message from Sasha King', 'Confirmed for 2 PM tomorrow 👍',
     now() - interval '30 minutes', null::timestamptz),
    ('job_status', 'Rohan Williams is on the way',
     'Your plumber will arrive in about 20 minutes.', now() - interval '4 hours', null),
    ('new_review', 'How did it go?',
     'Leave a review for your completed job — it helps the next customer.',
     now() - interval '2 days', now() - interval '1 day'),
    ('system', 'Welcome to myB',
     'Find trusted pros, book in a tap, and keep everything in one place.',
     now() - interval '20 days', now() - interval '20 days')
  ) as n (kind, title, body, created_at, read_at)
 where not exists (
   select 1 from public.notifications
    where user_id = '00000000-0000-4000-8000-000000000005'
      and title = 'Welcome to myB');

-- ── Verification records (verified workers' pipeline history) ───────────────
insert into public.verification_records
  (user_id, status, consent_given_at, consent_text_version, id_captured_at,
   liveness_passed, liveness_at, face_match_score, face_match_passed, face_matched_at)
select id, 'verified', now() - interval '60 days', 'v1', now() - interval '60 days',
       true, now() - interval '60 days', 0.8700, true, now() - interval '60 days'
  from public.profiles
 where identity_verified = true
on conflict (user_id) do nothing;

-- ── Trust tiers ─────────────────────────────────────────────────────────────
-- Mirror the server rule (0006): skill tier at 5+ jobs and 4.0★+.
update public.worker_profiles
   set tier_skill = (jobs_completed >= 5 and rating_avg >= 4.0);

-- ═══════════════════════════════════════════════════════════════════════════
-- SERVICE ECONOMY POPULATION (migration 0014)
-- ═══════════════════════════════════════════════════════════════════════════
-- 108 more workers across the non-construction services Jamaica actually runs
-- on — tutors, hairdressers, cooks, seamstresses, caregivers, phone repair,
-- drivers. Without these, searching "tutor" correctly returns nothing, because
-- the marketplace only contained building trades.

do $$
declare
  v_first text[] := array[
    'Shanice','Kemar','Tashana','Rohan','Latoya','Damion','Kimberly','Oneil','Simone','Rayon',
    'Georgia','Jermaine','Novia','Dwight','Racquel','Fabian','Yanique','Sanya','Chevonne','Paula',
    'Kadian','Michelle','Judith','Denise','Andre','Marlon','Alicia','Trevor','Camille','Nadia'];
  v_last text[] := array[
    'Barrett','Campbell','Reid','Palmer','Grant','Clarke','Morris','Simpson','Roberts','Lewis',
    'Thompson','Walker','Henry','Gordon','Facey','McKenzie','Blake','Sinclair','Dixon','Wright'];
  v_parishes text[] := array[
    'Kingston','St. Andrew','St. Catherine','St. James','Manchester','Clarendon','St. Ann',
    'Portland','St. Thomas','St. Mary','Trelawny','Hanover','Westmoreland','St. Elizabeth'];

  -- Trade, headline, service title, service description, rate unit, base rate.
  v_svc text[][] := array[
    array['tutoring','Tutor — maths, English & sciences','Primary & high school tutoring','One-on-one and small group tutoring for primary and high school students. Maths, English, integrated science. Homework help, exam technique, weekly sessions at home or online.','hour','2000'],
    array['exam-prep','CXC & CAPE exam preparation','CSEC / CAPE exam prep','Focused CXC CSEC and CAPE preparation. Past paper drilling, SBA guidance, study plans, revision classes before exams. Maths, English A, POB, POA, biology.','hour','2500'],
    array['music-lessons','Music teacher — piano, guitar & voice','Music lessons for all ages','Piano, keyboard, guitar and voice lessons for beginners to intermediate. Theory, sight reading, church and gospel music, exam preparation.','hour','2500'],
    array['driving-lessons','Certified driving instructor','Driving lessons & road test prep','Learner driver lessons, manual and automatic, road code, parking, hill starts and full road test preparation with a dual-control car.','hour','3000'],
    array['hairdressing','Hairdresser — natural hair, braids & weaves','Hair styling, braids & treatments','Natural hair care, cornrows, box braids, crochet, weaves, relaxers, deep conditioning and silk press. Home service available.','job','5000'],
    array['barbering','Barber — cuts, fades & line-ups','Haircuts, fades & shaves','Clean fades, tapers, line-ups, beard trims and hot towel shaves. Home and office visits, kids welcome.','job','1500'],
    array['nail-tech','Nail technician — gel, acrylic & pedicures','Manicures, pedicures & nail art','Gel and acrylic nails, overlays, refills, manicures, pedicures and custom nail art. Sterilised tools, home service available.','job','4000'],
    array['makeup','Makeup artist — bridal & events','Makeup for weddings & events','Bridal, graduation, photoshoot and event makeup. Airbrush and traditional, lashes included, trials available, travels to you.','job','8000'],
    array['massage','Massage therapist','Therapeutic & relaxation massage','Deep tissue, Swedish and sports massage for back pain, stiffness and stress. Mobile service with own table.','hour','5000'],
    array['fitness','Personal trainer','Personal training & fitness plans','One-on-one and group training, weight loss programmes, strength training, meal guidance. Home, gym or park sessions.','hour','3000'],
    array['catering','Caterer — Jamaican & continental','Catering for events & functions','Full catering for weddings, birthdays, church functions and office events. Jamaican and continental menus, serving staff available.','job','60000'],
    array['baking','Baker — cakes & pastries','Custom cakes & pastries','Birthday and wedding cakes, cupcakes, pastries, black cake and rum cake. Custom designs, delivery available.','job','8000'],
    array['bartending','Bartender & mixologist','Bar service for events','Professional bar service for weddings, parties and corporate events. Cocktail menus, glassware and bar setup included.','job','15000'],
    array['event-planning','Event planner & coordinator','Event planning & coordination','Weddings, birthdays, showers and corporate events. Venue sourcing, decor, vendor coordination and day-of management.','job','40000'],
    array['dj-music','DJ & sound system','DJ services & sound rental','Party, wedding and corporate DJ with full sound system, lighting and MC service. Reggae, dancehall, soca, gospel and old hits.','job','25000'],
    array['photography','Photographer & videographer','Photography & video coverage','Weddings, graduations, portraits, christenings and business shoots. Edited digital gallery, drone and video available.','job','30000'],
    array['cleaning','Housekeeper & deep cleaning','House & office cleaning','Regular housekeeping, deep cleans, move-in and move-out cleaning, post-construction cleanup. Own supplies, trustworthy and thorough.','day','8000'],
    array['laundry','Laundry & ironing service','Wash, dry & ironing','Wash and fold, ironing, uniforms, curtains and bedding. Pickup and delivery within the parish.','job','3000'],
    array['childcare','Babysitter & nanny','Childcare & babysitting','Reliable babysitting and nanny service, homework supervision, school pickup, meal prep. First aid trained, references available.','day','6000'],
    array['elder-care','Caregiver for the elderly','Elder care & companionship','Companionship, personal care, medication reminders, meal preparation and light housekeeping for elderly relatives. Day and live-in options.','day','8000'],
    array['pest-control','Pest control technician','Pest & termite treatment','Roach, ant, rodent, mosquito and termite treatment for homes and businesses. Safe products, follow-up visits included.','job','12000'],
    array['pool-cleaning','Pool technician','Pool cleaning & maintenance','Weekly pool cleaning, chemical balancing, filter and pump servicing, green-to-clean recovery.','job','10000'],
    array['dressmaking','Dressmaker & tailor','Dressmaking, tailoring & alterations','Custom dresses, uniforms, suits and church wear. Alterations, hemming, zip replacement and repairs. Quick turnaround.','job','6000'],
    array['shoe-repair','Shoe repair & leather work','Shoe repair & resoling','Resoling, heel replacement, stitching, zip repair, cleaning and dyeing for shoes, boots and bags.','job','2500'],
    array['upholstery','Upholsterer','Furniture upholstery & repair','Sofa and chair reupholstery, foam replacement, car seat repair, headboards and cushions. Fabric sourcing available.','job','25000'],
    array['furniture-making','Furniture maker','Custom furniture building','Handmade beds, tables, wardrobes, shelving and outdoor furniture in hardwood and board. Built to your measurements.','job','45000'],
    array['computer-repair','Computer technician','Laptop & desktop repair','Virus removal, Windows reinstall, screen and keyboard replacement, data recovery, upgrades and network setup.','job','5000'],
    array['phone-repair','Phone repair technician','Phone screen & battery repair','Cracked screen replacement, battery swaps, charging port repair, water damage and software unlocking for iPhone and Android.','job','6000'],
    array['web-design','Web & graphic designer','Websites, logos & flyers','Small business websites, online menus, logos, flyers, business cards and social media graphics. Fast, affordable, mobile-friendly.','job','35000'],
    array['bookkeeping','Bookkeeper for small business','Bookkeeping & record keeping','Monthly record keeping, invoicing, expense tracking, GCT and payroll preparation, and getting your books ready for TAJ filing.','job','15000'],
    array['social-media','Social media manager','Social media management','Instagram, TikTok and Facebook management for small businesses. Content planning, posting, captions and paid promotion setup.','job','20000'],
    array['delivery','Courier & delivery rider','Same-day delivery & courier','Same-day package, food and document delivery across the corporate area. Bike and car, careful handling.','job','1500'],
    array['moving','Mover & haulage','Moving, haulage & removals','House and office moving, furniture delivery, dump runs and material haulage. Truck and helpers included.','job','20000'],
    array['car-detailing','Auto detailer','Car wash & detailing','Interior and exterior detailing, wax and polish, engine bay cleaning, seat shampoo and headlight restoration. Mobile service.','job','7000'],
    array['generator-repair','Generator & small engine repair','Generator servicing & repair','Generator servicing, carburettor cleaning, starter and alternator repair, plus lawnmower and pressure washer servicing.','job','9000'],
    array['security','Security officer','Private security & event security','Trained security officers for events, construction sites, businesses and residential gates. Day and night shifts.','day','9000']
  ];

  v_comment text[] := array[
    'Excellent service, very professional and punctual.',
    'Really pleased with the work — would book again without hesitation.',
    'Great communication and fair pricing. Highly recommend.',
    'Did exactly what was promised and on time.',
    'Very patient and skilled. My family were impressed.',
    'Reliable and neat. Easy to deal with.',
    'Went above and beyond what I asked for.',
    'Good quality work at a reasonable price.'];

  v_customers uuid[];
  v_worker    uuid;
  v_customer  uuid;
  v_job       uuid;
  v_row       text[];
  v_parish    text;
  v_location  geography;
  v_rate      numeric;
  v_jobs      int;
  v_rating    int;
  v_days      int;
  i int;
  k int;
  n int;
begin
  if exists (select 1 from auth.users where email like 'svc%@demo.myb') then
    raise notice 'Service-economy workers already present — skipping.';
    return;
  end if;

  select array_agg(id) into v_customers from (
    select id from public.profiles where is_customer order by id limit 20
  ) c;

  n := array_length(v_svc, 1);

  for i in 1..108 loop
    v_worker := ('00000000-0000-4000-b000-' || lpad(i::text, 12, '0'))::uuid;
    v_row := v_svc[1 + (i % n) : 1 + (i % n)][1:6];
    v_parish := v_parishes[1 + (i % array_length(v_parishes, 1))];

    insert into auth.users
      (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
       raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
       confirmation_token, recovery_token, email_change, email_change_token_new)
    values
      ('00000000-0000-0000-0000-000000000000', v_worker, 'authenticated', 'authenticated',
       'svc' || lpad(i::text, 3, '0') || '@demo.myb',
       crypt('myb-demo-123', gen_salt('bf')), now(),
       '{"provider":"email","providers":["email"]}',
       jsonb_build_object('full_name',
         v_first[1 + (i % array_length(v_first, 1))] || ' ' ||
         v_last[1 + ((i * 3) % array_length(v_last, 1))]),
       now(), now(), '', '', '', '');

    update public.profiles
       set is_worker = true, parish = v_parish, identity_verified = (i % 3) <> 0
     where id = v_worker;

    select st_setsrid(
             st_makepoint(st_x(p.centroid::geometry) + (((i % 7) - 3) * 0.011),
                          st_y(p.centroid::geometry) + (((i % 5) - 2) * 0.011)),
             4326)::geography
      into v_location
      from public.parishes p where p.country = 'JM' and p.name = v_parish;

    v_rate := v_svc[1 + (i % n)][6]::numeric;

    insert into public.worker_profiles
      (user_id, headline, bio, parish, location, years_experience,
       rate_min_jmd, rate_max_jmd, rate_unit, available)
    values
      (v_worker, v_svc[1 + (i % n)][2],
       v_svc[1 + (i % n)][4] || ' Based in ' || v_parish || '.',
       v_parish, v_location, 1 + (i % 15),
       v_rate, v_rate + (i % 3) * (v_rate * 0.15),
       v_svc[1 + (i % n)][5], (i % 9) <> 0);

    insert into public.service_descriptions (user_id, trade_slug, title, description)
    values (v_worker, v_svc[1 + (i % n)][1], v_svc[1 + (i % n)][3], v_svc[1 + (i % n)][4]);

    v_jobs := 1 + (i % 8);
    for k in 1..v_jobs loop
      v_job := gen_random_uuid();
      v_customer := v_customers[1 + ((i + k) % array_length(v_customers, 1))];
      v_days := 4 + ((i * 5 + k * 9) % 80);

      insert into public.jobs
        (id, customer_id, worker_id, title, description, trade_slug, parish, urgency,
         status, requested_at, responded_at, started_at, completed_at, agreed_price_jmd)
      values
        (v_job, v_customer, v_worker, v_svc[1 + (i % n)][3],
         'Booked through myB in ' || v_parish || '.',
         v_svc[1 + (i % n)][1], v_parish,
         (array['low','normal','normal','high'])[1 + ((i + k) % 4)]::public.job_urgency,
         'completed',
         now() - (v_days || ' days')::interval,
         now() - (v_days || ' days')::interval + interval '90 minutes',
         now() - ((v_days - 1) || ' days')::interval,
         now() - ((v_days - 1) || ' days')::interval,
         v_rate * (1 + (k % 2)));

      v_rating := case when (i + k) % 12 = 0 then 3 when (i + k) % 5 = 0 then 4 else 5 end;

      insert into public.reviews (job_id, worker_id, reviewer_id, rating, comment)
      values (v_job, v_worker, v_customer, v_rating,
              v_comment[1 + ((i + k) % array_length(v_comment, 1))]);
    end loop;
  end loop;

  raise notice 'Seeded 108 service-economy workers (tutors, stylists, cooks, carers, tech).';
end $$;

-- Re-apply the skill tier now that the new workers have job history.
update public.worker_profiles
   set tier_skill = (jobs_completed >= 5 and rating_avg >= 4.0);

-- ═══════════════════════════════════════════════════════════════════════════
-- BIZBOT KNOWLEDGE BASE (migration 0015)
-- ═══════════════════════════════════════════════════════════════════════════
-- Chunks come from docs/kb/*.md, one row per paragraph, so full-text retrieval
-- has something to return. Verify every fee and threshold against the current
-- TAJ/COJ publications before demo day — source_url is filled where confirmed.

insert into public.kb_documents (slug, title, country, parish, topic, source_name, source_url)
values ('business-name-registration', 'Registering a business name (sole trader)', 'JM',
        null,
        'registration', 'Companies Office of Jamaica', 'https://www.orcjamaica.com/')
on conflict (slug) do update set title = excluded.title, source_url = excluded.source_url;
insert into public.kb_chunks (document_id, chunk_index, content, country, topic)
select d.id, 0, 'If you trade under any name other than your own legal name — for example "Delroy''s Electrical" instead of just "Delroy Brown" — Jamaican law requires you to register that business name with the Companies Office of Jamaica (COJ). Registering as a sole trader with a business name is the simplest and cheapest way to formalize a one-person trade business.', 'JM', 'registration'
  from public.kb_documents d where d.slug = 'business-name-registration'
on conflict (document_id, chunk_index) do update set content = excluded.content;
insert into public.kb_chunks (document_id, chunk_index, content, country, topic)
select d.id, 1, 'To register, complete the Business Name application (Form BRF 1) and submit it to the COJ with your TRN, valid photo identification, and the registration fee. You can apply in person at the COJ office in Kingston, at some Post Offices acting as agents, or online through the COJ''s electronic filing portal. Processing typically takes a few business days.', 'JM', 'registration'
  from public.kb_documents d where d.slug = 'business-name-registration'
on conflict (document_id, chunk_index) do update set content = excluded.content;
insert into public.kb_chunks (document_id, chunk_index, content, country, topic)
select d.id, 2, 'The registration fee for a business name is modest (verify the current fee on the COJ fee schedule before applying, as fees are periodically revised). Registration must be renewed every three years for a smaller renewal fee.', 'JM', 'registration'
  from public.kb_documents d where d.slug = 'business-name-registration'
on conflict (document_id, chunk_index) do update set content = excluded.content;
insert into public.kb_chunks (document_id, chunk_index, content, country, topic)
select d.id, 3, 'Registering your business name does not create a company — you remain personally responsible for the business. If you later want limited liability, you can incorporate a company with the COJ, which is a separate, more involved process with higher fees and annual filing obligations. Many tradespeople operate successfully for years as registered sole traders before considering incorporation.', 'JM', 'registration'
  from public.kb_documents d where d.slug = 'business-name-registration'
on conflict (document_id, chunk_index) do update set content = excluded.content;
insert into public.kb_chunks (document_id, chunk_index, content, country, topic)
select d.id, 4, 'Benefits of registering include: opening a business bank account in the trade name, issuing invoices and receipts that look professional, qualifying for many supplier and commercial accounts, and being eligible to bid for contracts that require a registered business.', 'JM', 'registration'
  from public.kb_documents d where d.slug = 'business-name-registration'
on conflict (document_id, chunk_index) do update set content = excluded.content;
insert into public.kb_documents (slug, title, country, parish, topic, source_name, source_url)
values ('gct', 'GCT (General Consumption Tax) basics for small traders', 'JM',
        null,
        'tax', 'Tax Administration Jamaica', 'https://www.jamaicatax.gov.jm/general-consumption-tax1/')
on conflict (slug) do update set title = excluded.title, source_url = excluded.source_url;
insert into public.kb_chunks (document_id, chunk_index, content, country, topic)
select d.id, 0, 'General Consumption Tax (GCT) is Jamaica''s value-added tax, charged on most goods and services. The standard rate is applied at each stage of sale, and registered businesses collect it on behalf of Tax Administration Jamaica (TAJ).', 'JM', 'tax'
  from public.kb_documents d where d.slug = 'gct'
on conflict (document_id, chunk_index) do update set content = excluded.content;
insert into public.kb_chunks (document_id, chunk_index, content, country, topic)
select d.id, 1, 'Small tradespeople usually do not need to register for GCT straight away. GCT registration is only mandatory once your gross revenue passes the registration threshold set by TAJ (a yearly turnover figure — verify the current threshold with TAJ, as it is revised from time to time). Below the threshold, you simply do not charge GCT on your services.', 'JM', 'tax'
  from public.kb_documents d where d.slug = 'gct'
on conflict (document_id, chunk_index) do update set content = excluded.content;
insert into public.kb_chunks (document_id, chunk_index, content, country, topic)
select d.id, 2, 'If your business grows past the threshold, you must register with TAJ as a GCT taxpayer, charge GCT on your invoices, file GCT returns (normally monthly), and pay over the tax collected. Registered businesses can also claim back the GCT they pay on business inputs like tools and materials, which can reduce costs.', 'JM', 'tax'
  from public.kb_documents d where d.slug = 'gct'
on conflict (document_id, chunk_index) do update set content = excluded.content;
insert into public.kb_chunks (document_id, chunk_index, content, country, topic)
select d.id, 3, 'Charging GCT without being registered is an offence, and so is failing to register once you cross the threshold. If you are unsure whether your turnover is approaching the threshold, keeping simple monthly records of what you earn — as the MyB app encourages — makes the answer obvious and keeps you safe.', 'JM', 'tax'
  from public.kb_documents d where d.slug = 'gct'
on conflict (document_id, chunk_index) do update set content = excluded.content;
insert into public.kb_documents (slug, title, country, parish, topic, source_name, source_url)
values ('income-tax-tcc', 'Income tax and the Tax Compliance Certificate (TCC)', 'JM',
        null,
        'tax', 'Tax Administration Jamaica', 'https://www.jamaicatax.gov.jm/')
on conflict (slug) do update set title = excluded.title, source_url = excluded.source_url;
insert into public.kb_chunks (document_id, chunk_index, content, country, topic)
select d.id, 0, 'Self-employed people in Jamaica are responsible for declaring their own income and paying income tax on profits above the annual income tax threshold (a yearly amount that is tax-free — verify the current threshold with TAJ, as it is adjusted periodically). Below the threshold, no income tax is due, but filing still builds your record.', 'JM', 'tax'
  from public.kb_documents d where d.slug = 'income-tax-tcc'
on conflict (document_id, chunk_index) do update set content = excluded.content;
insert into public.kb_chunks (document_id, chunk_index, content, country, topic)
select d.id, 1, 'As a self-employed person you file an annual income tax return with Tax Administration Jamaica declaring what you earned and your allowable business expenses — tools, materials, transport for jobs, and similar costs reduce your taxable profit. Estimated tax for the current year is normally paid in quarterly instalments. Simple, honest records make filing quick; your MyB job history is useful supporting evidence of income.', 'JM', 'tax'
  from public.kb_documents d where d.slug = 'income-tax-tcc'
on conflict (document_id, chunk_index) do update set content = excluded.content;
insert into public.kb_chunks (document_id, chunk_index, content, country, topic)
select d.id, 2, 'A Tax Compliance Certificate (TCC) is a certificate from TAJ confirming your tax affairs are in order. Many larger customers, insurance companies, and all government bodies require a valid TCC before awarding contracts. For a tradesperson, holding a TCC is often the single document that unlocks commercial and government work.', 'JM', 'tax'
  from public.kb_documents d where d.slug = 'income-tax-tcc'
on conflict (document_id, chunk_index) do update set content = excluded.content;
insert into public.kb_chunks (document_id, chunk_index, content, country, topic)
select d.id, 3, 'To get a TCC you need to be registered (TRN), have filed the returns you are required to file, and be up to date on payments (income tax, NIS, and — if registered — GCT and education tax). TCCs are issued for a limited validity period and must be renewed. If you are behind, TAJ can arrange payment plans that restore compliance — being behind is a fixable state, not a dead end.', 'JM', 'tax'
  from public.kb_documents d where d.slug = 'income-tax-tcc'
on conflict (document_id, chunk_index) do update set content = excluded.content;
insert into public.kb_documents (slug, title, country, parish, topic, source_name, source_url)
values ('nis', 'NIS for self-employed workers', 'JM',
        null,
        'insurance', 'National Insurance Scheme, Ministry of Labour and Social Security', 'https://mlss.gov.jm/departments/national-insurance-scheme/')
on conflict (slug) do update set title = excluded.title, source_url = excluded.source_url;
insert into public.kb_chunks (document_id, chunk_index, content, country, topic)
select d.id, 0, 'The National Insurance Scheme (NIS) is Jamaica''s compulsory social security programme, run by the Ministry of Labour and Social Security. It provides a retirement pension plus benefits for employment injury, invalidity, and survivors. Self-employed people — including independent tradespeople — are required to register and contribute.', 'JM', 'insurance'
  from public.kb_documents d where d.slug = 'nis'
on conflict (document_id, chunk_index) do update set content = excluded.content;
insert into public.kb_chunks (document_id, chunk_index, content, country, topic)
select d.id, 1, 'To register, visit an NIS office with your TRN and identification and complete the self-employed registration form. You will be issued an NIS number. Contributions for self-employed persons are paid on your declared earnings at the self-employed contribution rate (verify the current rate and payment schedule with the NIS, as rates are updated).', 'JM', 'insurance'
  from public.kb_documents d where d.slug = 'nis'
on conflict (document_id, chunk_index) do update set content = excluded.content;
insert into public.kb_chunks (document_id, chunk_index, content, country, topic)
select d.id, 2, 'Why it matters for an informal worker going formal: NIS contributions are the difference between having a pension at retirement and having nothing, and they provide a safety net if you are injured and cannot work. A contribution history is also further proof of steady income, which supports loan applications alongside your MyB reputation record.', 'JM', 'insurance'
  from public.kb_documents d where d.slug = 'nis'
on conflict (document_id, chunk_index) do update set content = excluded.content;
insert into public.kb_chunks (document_id, chunk_index, content, country, topic)
select d.id, 3, 'Contributions can be paid at tax offices. Keeping your payments current keeps you in benefit — long gaps can reduce or delay what you can claim later.', 'JM', 'insurance'
  from public.kb_documents d where d.slug = 'nis'
on conflict (document_id, chunk_index) do update set content = excluded.content;
insert into public.kb_documents (slug, title, country, parish, topic, source_name, source_url)
values ('trn', 'Getting a TRN (Taxpayer Registration Number)', 'JM',
        null,
        'tax', 'Tax Administration Jamaica', 'https://www.jamaicatax.gov.jm/')
on conflict (slug) do update set title = excluded.title, source_url = excluded.source_url;
insert into public.kb_chunks (document_id, chunk_index, content, country, topic)
select d.id, 0, 'A Taxpayer Registration Number (TRN) is a unique nine-digit number issued by Tax Administration Jamaica (TAJ) that identifies you for all tax and many official purposes in Jamaica. You need a TRN before you can register a business name, open most bank accounts, file taxes, or apply for a Tax Compliance Certificate.', 'JM', 'tax'
  from public.kb_documents d where d.slug = 'trn'
on conflict (document_id, chunk_index) do update set content = excluded.content;
insert into public.kb_chunks (document_id, chunk_index, content, country, topic)
select d.id, 1, 'Getting a TRN is free. Individuals apply at any TAJ tax office by completing the TRN application form and presenting identification: a passport, driver''s licence, or national ID, or a birth certificate together with another supporting document. Applications can also be started online through TAJ''s website.', 'JM', 'tax'
  from public.kb_documents d where d.slug = 'trn'
on conflict (document_id, chunk_index) do update set content = excluded.content;
insert into public.kb_chunks (document_id, chunk_index, content, country, topic)
select d.id, 2, 'If you work for yourself — for example as a plumber, electrician, carpenter, or other tradesperson — you use your individual TRN for your business dealings as a sole trader. A separate business TRN is only needed if you register a company (for example a limited company with the Companies Office of Jamaica).', 'JM', 'tax'
  from public.kb_documents d where d.slug = 'trn'
on conflict (document_id, chunk_index) do update set content = excluded.content;
insert into public.kb_chunks (document_id, chunk_index, content, country, topic)
select d.id, 3, 'Once issued, your TRN never changes and never expires. If you lose your TRN card, TAJ can reissue it; you do not apply for a new number. Keep your TRN private and only share it with institutions that legitimately need it, such as banks, government agencies, and employers.', 'JM', 'tax'
  from public.kb_documents d where d.slug = 'trn'
on conflict (document_id, chunk_index) do update set content = excluded.content;
insert into public.kb_documents (slug, title, country, parish, topic, source_name, source_url)
values ('why-formalize', 'Why formalize? What changes when your business is official', 'JM',
        null,
        'general', 'MyB / Jamaica Business Development Corporation', 'https://www.jbdc.net/')
on conflict (slug) do update set title = excluded.title, source_url = excluded.source_url;
insert into public.kb_chunks (document_id, chunk_index, content, country, topic)
select d.id, 0, 'Formalizing means your business exists on paper: you have a TRN, your business name is registered, you file simple taxes, and you contribute to NIS. It does not mean becoming a big company overnight — a one-person trade business can be fully formal.', 'JM', 'general'
  from public.kb_documents d where d.slug = 'why-formalize'
on conflict (document_id, chunk_index) do update set content = excluded.content;
insert into public.kb_chunks (document_id, chunk_index, content, country, topic)
select d.id, 1, 'What formalization unlocks: access to loans and financing (banks and credit unions need proof of income — your registration, filings, and MyB reputation record all count); the ability to bid for contracts with companies, hotels, and government, most of which require a registered business and a Tax Compliance Certificate; a pension and injury protection through NIS; and a business bank account in your trade name.', 'JM', 'general'
  from public.kb_documents d where d.slug = 'why-formalize'
on conflict (document_id, chunk_index) do update set content = excluded.content;
insert into public.kb_chunks (document_id, chunk_index, content, country, topic)
select d.id, 2, 'What it costs: the TRN is free, NIS registration is free, and business name registration carries a modest fee renewed every three years. Income tax only applies to profit above the annual threshold, and GCT only applies once your turnover passes the GCT registration threshold. For most small tradespeople the direct cost of being formal is small compared to the work it unlocks.', 'JM', 'general'
  from public.kb_documents d where d.slug = 'why-formalize'
on conflict (document_id, chunk_index) do update set content = excluded.content;
insert into public.kb_chunks (document_id, chunk_index, content, country, topic)
select d.id, 3, 'Common worry: "if mi register, tax man come fi mi." In practice, income below the tax threshold owes no income tax — registering mostly means filing simple paperwork that proves your income. That proof is exactly what lenders and big customers need to say yes to you.', 'JM', 'general'
  from public.kb_documents d where d.slug = 'why-formalize'
on conflict (document_id, chunk_index) do update set content = excluded.content;
insert into public.kb_chunks (document_id, chunk_index, content, country, topic)
select d.id, 4, 'The Jamaica Business Development Corporation (JBDC) offers free guidance for small businesses at every stage, and HEART/NSTA Trust offers free or subsidised certification that raises what you can charge. You do not have to figure formalization out alone.', 'JM', 'general'
  from public.kb_documents d where d.slug = 'why-formalize'
on conflict (document_id, chunk_index) do update set content = excluded.content;
insert into public.kb_chunks (document_id, chunk_index, content, country, topic)
select d.id, 100, 'The BRF 1 form used to register a business name at the Companies Office of Jamaica is known as the Super Form because it is a one-stop document. When you submit it, the Companies Office notifies Tax Administration Jamaica, the National Insurance Scheme, HEART Trust and the National Housing Trust on your behalf. The certificate you receive comes back with your TRN and NIS number already attached, so you do not have to register with each agency separately.', 'JM', d.topic
  from public.kb_documents d where d.slug = 'business-name-registration'
on conflict (document_id, chunk_index) do update set content = excluded.content;
insert into public.kb_chunks (document_id, chunk_index, content, country, topic)
select d.id, 101, 'The registration fee for a business name as a sole trader or partnership is J$2,500 and must accompany the BRF 1 form. Registration is normally processed within a few working days. A business name registration must be renewed periodically, so keep note of the renewal date on your certificate.', 'JM', d.topic
  from public.kb_documents d where d.slug = 'business-name-registration'
on conflict (document_id, chunk_index) do update set content = excluded.content;
insert into public.kb_chunks (document_id, chunk_index, content, country, topic)
select d.id, 100, 'You only have to register for General Consumption Tax once your taxable sales pass J$15 million in a year. This threshold was raised from J$10 million with effect from 1 April 2025. If your sales are below the threshold you do not charge GCT on your work at all, which is the case for most independent tradespeople and service providers.', 'JM', d.topic
  from public.kb_documents d where d.slug = 'gct'
on conflict (document_id, chunk_index) do update set content = excluded.content;
insert into public.kb_chunks (document_id, chunk_index, content, country, topic)
select d.id, 101, 'If your sales do cross the J$15 million threshold you must apply for GCT registration within 21 days of crossing it, using the GCT-1 form. You need a valid TRN before you can submit that form. Registering late allows TAJ to assess GCT on all taxable supplies from the date you crossed the threshold, plus interest, and collecting GCT from customers before you are registered carries a separate penalty.', 'JM', d.topic
  from public.kb_documents d where d.slug = 'gct'
on conflict (document_id, chunk_index) do update set content = excluded.content;
