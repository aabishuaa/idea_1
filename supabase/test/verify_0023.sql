-- Assertions for migration 0023. Run after harness.sql + all migrations.
--   psql -v ON_ERROR_STOP=1 -f supabase/test/verify_0023.sql
-- Any failure raises, so a non-zero exit means the migration is not shippable.

\set ON_ERROR_STOP on
\timing off

-- ─────────────────────────────────────────────────────────────────────────────
-- Fixtures: a local worker, a Virtual worker, and a customer.
-- ─────────────────────────────────────────────────────────────────────────────
begin;

select public.harness_new_user('local@t.test',   'Delroy Campbell')   as local_id  \gset
select public.harness_new_user('virtual@t.test', 'Tashana Thompson')  as virt_id   \gset
select public.harness_new_user('cust@t.test',    'Miss Brown')        as cust_id   \gset

insert into public.worker_profiles (user_id, headline, parish, location, available, visible, reputation, rating_avg, rating_count, jobs_completed)
values
  (:'local_id', 'Licensed plumber', 'Kingston',
   st_setsrid(st_makepoint(-76.7936, 17.9714), 4326)::geography, true, true, 90, 4.8, 20, 40),
  (:'virt_id',  'Maths tutor',      'Virtual', null, true, true, 88, 4.9, 15, 30);

insert into public.service_descriptions (user_id, trade_slug, title, description)
values
  (:'local_id', 'plumbing', 'Leak repair and pipe work', 'Fix leaking pipes, sinks and taps'),
  (:'virt_id',  'tutoring', 'CSEC maths tutoring',        'Online maths lessons for CSEC students');

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Virtual workers survive a parish filter; irrelevant ones still do not.
-- ─────────────────────────────────────────────────────────────────────────────
do $$
declare n int;
begin
  -- Filtering to a parish the virtual worker is not "in" must still return them.
  select count(*) into n
    from public.match_workers(p_parish => 'St. James', p_limit => 50)
   where full_name = 'Tashana Thompson';
  if n <> 1 then
    raise exception 'FAIL: virtual worker missing from a St. James search (got %)', n;
  end if;

  -- The Kingston plumber must NOT appear in a St. James search.
  select count(*) into n
    from public.match_workers(p_parish => 'St. James', p_limit => 50)
   where full_name = 'Delroy Campbell';
  if n <> 0 then
    raise exception 'FAIL: Kingston worker leaked into a St. James search (got %)', n;
  end if;

  raise notice 'PASS 1: Virtual matches every parish; local workers stay local';
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Virtual proximity is scored as unconstrained (0.85), not unknown (0.5).
-- ─────────────────────────────────────────────────────────────────────────────
do $$
declare virt numeric; base numeric;
begin
  select match_score into virt
    from public.match_workers(p_limit => 50) where full_name = 'Tashana Thompson';
  -- Reputation 88, available, 30 jobs capped at 20 → the only unknown is
  -- proximity. 0.35*0.5 + 0.25*0.85 + 0.20*0.88 + 0.10 + 0.10 = 0.7635
  base := round((0.35 * 0.5 + 0.25 * 0.85 + 0.20 * 0.88 + 0.10 * 1 + 0.10 * 1)::numeric, 4);
  if abs(virt - base) > 0.0002 then
    raise exception 'FAIL: virtual proximity not scored at 0.85 (score % expected %)', virt, base;
  end if;
  raise notice 'PASS 2: virtual proximity scored 0.85 (match_score %)', virt;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Search by name finds a person, and ranks them above a service match.
-- ─────────────────────────────────────────────────────────────────────────────
do $$
declare top text; n int;
begin
  select full_name into top
    from public.match_workers(p_query => 'Tashana Thompson', p_limit => 10)
   order by match_score desc limit 1;
  if top is distinct from 'Tashana Thompson' then
    raise exception 'FAIL: name search did not return the person first (got %)', top;
  end if;

  -- A partial / single-name query has to work too — people type one name.
  select count(*) into n
    from public.match_workers(p_query => 'Tashana', p_limit => 10)
   where full_name = 'Tashana Thompson';
  if n <> 1 then
    raise exception 'FAIL: first-name-only search missed the person (got %)', n;
  end if;

  raise notice 'PASS 3: search by name works on full and partial names';
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Plain-language search still works — the name changes must not regress it.
-- ─────────────────────────────────────────────────────────────────────────────
do $$
declare top text;
begin
  select full_name into top
    from public.match_workers(p_query => 'mi sink a leak under di counter', p_limit => 10)
   order by match_score desc limit 1;
  if top is distinct from 'Delroy Campbell' then
    raise exception 'FAIL: patois plumbing query regressed (got %)', top;
  end if;
  raise notice 'PASS 4: plain-language search still resolves to the plumber';
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Urgency is derived from the date window, and stays in step with it.
-- ─────────────────────────────────────────────────────────────────────────────
do $$
declare v_job uuid; v_urgency text;
begin
  insert into public.jobs (customer_id, worker_id, title, description, needed_from, needed_by)
  values ((select id from public.profiles where full_name = 'Miss Brown'),
          (select id from public.profiles where full_name = 'Delroy Campbell'),
          'Fix the kitchen tap', 'Dripping badly', current_date, current_date + 2)
  returning id into v_job;

  select urgency into v_urgency from public.jobs where id = v_job;
  if v_urgency <> 'emergency' then
    raise exception 'FAIL: today-start window should be emergency (got %)', v_urgency;
  end if;

  -- Move the window out; the urgency must follow.
  update public.jobs set needed_from = current_date + 30, needed_by = current_date + 40
   where id = v_job;
  select urgency into v_urgency from public.jobs where id = v_job;
  if v_urgency <> 'low' then
    raise exception 'FAIL: distant window should be low (got %)', v_urgency;
  end if;

  -- And the window cannot be inverted.
  begin
    update public.jobs set needed_from = current_date + 10, needed_by = current_date + 1
     where id = v_job;
    raise exception 'FAIL: an inverted date window was accepted';
  exception when check_violation then
    null; -- expected
  end;

  raise notice 'PASS 5: urgency derives from the window; inverted windows refused';
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Explore feed returns portfolio work, caps 3 per worker, and pages stably.
-- ─────────────────────────────────────────────────────────────────────────────
do $$
declare n int; page1 uuid[]; page2 uuid[];
begin
  -- Five photos for one worker; only three may reach the feed.
  insert into public.portfolio_items (user_id, storage_path, caption)
  select (select id from public.profiles where full_name = 'Delroy Campbell'),
         'p/' || g || '.jpg', 'job ' || g
    from generate_series(1, 5) g;

  select count(*) into n from public.get_explore_feed(p_limit => 50)
   where full_name = 'Delroy Campbell';
  if n <> 3 then
    raise exception 'FAIL: per-worker cap not applied (got % items)', n;
  end if;

  -- Paging must not repeat or drop rows.
  select array_agg(item_id order by item_id) into page1
    from public.get_explore_feed(p_limit => 2, p_offset => 0);
  select array_agg(item_id order by item_id) into page2
    from public.get_explore_feed(p_limit => 2, p_offset => 2);
  if page1 && page2 then
    raise exception 'FAIL: explore pages overlap (% / %)', page1, page2;
  end if;

  raise notice 'PASS 6: explore feed caps 3 per worker and pages without overlap';
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Explore hides invisible workers.
-- ─────────────────────────────────────────────────────────────────────────────
do $$
declare n int;
begin
  update public.worker_profiles set visible = false
   where user_id = (select id from public.profiles where full_name = 'Delroy Campbell');

  select count(*) into n from public.get_explore_feed(p_limit => 50)
   where full_name = 'Delroy Campbell';
  if n <> 0 then
    raise exception 'FAIL: a hidden worker appeared in Explore (got %)', n;
  end if;

  update public.worker_profiles set visible = true
   where user_id = (select id from public.profiles where full_name = 'Delroy Campbell');
  raise notice 'PASS 7: hidden workers stay out of Explore';
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. Contact privacy. This is the assertion that matters most in this file:
--    an unpublished phone number must be unreachable by a stranger, and
--    reachable by a customer who actually booked them.
-- ─────────────────────────────────────────────────────────────────────────────
insert into public.worker_contacts (user_id, phone, email, show_publicly)
values (:'local_id', '876-555-0101', 'delroy@example.com', false);

select public.harness_new_user('stranger@t.test', 'A Stranger') as stranger_id \gset

/*
  Every id is resolved HERE, before any role switch, and passed in as a psql
  variable.

  Looking a user's own id up from public.profiles *after* switching role is a
  trap: profiles is itself under RLS, auth.uid() is still NULL at that moment,
  so the lookup returns NULL, the claim is never set, and every subsequent
  "must not be visible" assertion passes for the wrong reason. Test 8a was
  green that way while proving nothing.
*/
create temp table contact_probe (step text primary key, rows int);
-- The probes run as `authenticated`, so that role has to be able to record them.
grant all on contact_probe to authenticated;

-- The job from test 5 is 'requested'; a booking only counts once accepted.
update public.jobs set status = 'accepted'
 where worker_id = :'local_id';

-- (a) The owner reads their own row. This is the positive control: if this is
--     0, the claim plumbing is broken and the negative tests below are void.
set role authenticated;
select set_config('request.jwt.claim.sub', :'local_id', false);
insert into contact_probe select 'owner', count(*) from public.worker_contacts;
reset role;

-- (b) A stranger, contact unpublished: must see nothing.
set role authenticated;
select set_config('request.jwt.claim.sub', :'stranger_id', false);
insert into contact_probe select 'stranger_unpublished', count(*) from public.worker_contacts;
reset role;

-- (c) The customer who actually booked them: must see it, unpublished or not.
set role authenticated;
select set_config('request.jwt.claim.sub', :'cust_id', false);
insert into contact_probe select 'booked_customer', count(*) from public.worker_contacts;
reset role;

-- (d) Published: readable by anyone signed in.
update public.worker_contacts set show_publicly = true where user_id = :'local_id';
set role authenticated;
select set_config('request.jwt.claim.sub', :'stranger_id', false);
insert into contact_probe select 'stranger_published', count(*) from public.worker_contacts;
-- ...but still not writable by them.
update public.worker_contacts set phone = '000-HACKED' where user_id = :'local_id';
insert into contact_probe select 'stranger_wrote', count(*)
  from public.worker_contacts where phone = '000-HACKED';
reset role;

do $$
declare
  v_owner int;
  v_stranger_unpub int;
  v_booked int;
  v_stranger_pub int;
  v_written int;
begin
  select rows into v_owner            from contact_probe where step = 'owner';
  select rows into v_stranger_unpub   from contact_probe where step = 'stranger_unpublished';
  select rows into v_booked           from contact_probe where step = 'booked_customer';
  select rows into v_stranger_pub     from contact_probe where step = 'stranger_published';
  select rows into v_written          from contact_probe where step = 'stranger_wrote';

  if v_owner <> 1 then
    raise exception 'FAIL (control): owner could not read own contact row (% rows) — claim plumbing broken, other results meaningless', v_owner;
  end if;
  if v_stranger_unpub <> 0 then
    raise exception 'FAIL: unpublished contact leaked to a stranger (% rows)', v_stranger_unpub;
  end if;
  if v_booked <> 1 then
    raise exception 'FAIL: a customer with an accepted booking could not reach their worker (% rows)', v_booked;
  end if;
  if v_stranger_pub <> 1 then
    raise exception 'FAIL: a published contact was not readable (% rows)', v_stranger_pub;
  end if;
  if v_written <> 0 then
    raise exception 'FAIL: a stranger rewrote another worker''s contact details';
  end if;

  raise notice 'PASS 8: contact privacy — owner reads, stranger blocked, booked customer allowed, published readable, writes refused';
end $$;

rollback;

\echo ''
\echo '======================================'
\echo ' migration 0023 verified'
\echo '======================================'
