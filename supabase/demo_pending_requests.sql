-- MyB — demo utility: put fresh job requests in a worker's inbox.
--
-- WHY THIS EXISTS
-- seed.sql builds history: hundreds of completed jobs so ratings, reputation
-- and Top Pro tiers are trigger-computed rather than faked. History is the
-- wrong thing for the request inbox, though — an accepted job is not waiting
-- on anybody. So a freshly seeded worker opens Bookings to an empty
-- "requests waiting on you" section.
--
-- Run this before a demo and the featured pro has three real requests waiting,
-- from three different customers, with different urgencies. Then send a fourth
-- live from the customer phone to show it landing in real time.
--
-- HOW TO RUN
--   Hosted project : paste into the SQL Editor and Run
--   Local stack    : psql "$DATABASE_URL" -f supabase/demo_pending_requests.sql
--
-- Safe to run repeatedly: it clears the worker's existing unanswered requests
-- first, so you always get exactly these three back — including after a
-- rehearsal where you accepted them all.

set search_path = public, extensions;

do $$
declare
  -- The account you will demo the WORKER side from.
  v_worker_email constant text := 'rohan@demo.myb';
  v_worker  uuid;
  v_andre   uuid;
  v_brown   uuid;
  v_keisha  uuid;
begin
  select id into v_worker from auth.users where email = v_worker_email;
  if v_worker is null then
    raise exception 'Worker % not found — run seed.sql first.', v_worker_email;
  end if;

  select id into v_andre  from auth.users where email = 'andre@demo.myb';
  select id into v_brown  from auth.users where email = 'brown@demo.myb';
  select id into v_keisha from auth.users where email = 'keisha@demo.myb';

  if v_andre is null or v_brown is null or v_keisha is null then
    raise exception 'Demo customers missing — run seed.sql first.';
  end if;

  -- Clear whatever is unanswered so a rehearsal does not leave leftovers.
  delete from public.jobs where worker_id = v_worker and status = 'requested';

  insert into public.jobs
    (customer_id, worker_id, title, description, trade_slug, parish,
     urgency, budget_min_jmd, budget_max_jmd, status, requested_at)
  values
    (v_andre, v_worker,
     'Kitchen sink leaking under the counter',
     'Water pooling in the cupboard under the sink since yesterday. Looks like it''s coming from the joint. Need it looked at before it damages the press.',
     'plumbing', 'Kingston', 'high', 6000, 9000, 'requested', now() - interval '18 minutes'),
    (v_brown, v_worker,
     'Bathroom tap won''t stop running',
     'The cold tap in the guest bathroom drips constantly. Probably just needs a washer but I''d rather someone who knows what they''re doing.',
     'plumbing', 'Kingston', 'normal', 4000, 6000, 'requested', now() - interval '3 hours'),
    (v_keisha, v_worker,
     'Install washing machine hookup',
     'Just bought a washer. Need the water line and drain run to the back verandah. Happy to work around your schedule.',
     'plumbing', 'St. Andrew', 'low', 8000, 12000, 'requested', now() - interval '1 day');

  raise notice 'Inbox ready: % has 3 requests waiting.', v_worker_email;
end $$;
