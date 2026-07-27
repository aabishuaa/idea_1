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
