-- Assertions for migration 0024 — two-sided completion and payment.
--   psql -v ON_ERROR_STOP=1 -f supabase/test/verify_0024.sql
--
-- "Must be refused" cases use psql's :ERROR rather than a plpgsql exception
-- handler: a DO block cannot see a \gset variable reliably (psql does not
-- interpolate inside dollar quotes), and catching `when others` would also
-- swallow a genuine bug and report it as a pass.
--
-- Each one is wrapped in a savepoint, because a refused statement aborts the
-- transaction and every later assertion would then fail for the wrong reason.
-- The flag is copied out with \set BEFORE the rollback, since a successful
-- `rollback to savepoint` resets :ERROR back to false.

begin;

select public.harness_new_user('w24@t.test', 'Delroy Worker')   as worker_id \gset
select public.harness_new_user('c24@t.test', 'Brown Customer')  as cust_id   \gset
select public.harness_new_user('x24@t.test', 'Nosy Stranger')   as stranger_id \gset

insert into public.worker_profiles (user_id, headline, parish, available, visible)
values (:'worker_id', 'Plumber', 'Kingston', true, true);

insert into public.jobs (customer_id, worker_id, title, description, status)
values (:'cust_id', :'worker_id', 'Fix the tap', 'Dripping', 'accepted')
returning id as job_a \gset

insert into public.jobs (customer_id, worker_id, title, description, status)
values (:'cust_id', :'worker_id', 'Cancelled work', 'nope', 'cancelled')
returning id as job_b \gset

insert into public.jobs (customer_id, worker_id, title, description, status)
values (:'cust_id', :'worker_id', 'Self accept', 'nope', 'requested')
returning id as job_c \gset

create temp table probe (step text primary key, ok boolean, detail text);
grant all on probe to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. THE SECURITY FIX — status can no longer be written by a participant.
-- ═══════════════════════════════════════════════════════════════════════════
set role authenticated;
select set_config('request.jwt.claim.sub', :'worker_id', false);

savepoint sp1;
\set ON_ERROR_STOP off
update public.jobs set status = 'completed' where id = :'job_a';
\set refused1 :ERROR
\set ON_ERROR_STOP on
rollback to savepoint sp1;
insert into probe values ('1_direct_status_write_refused', :refused1, 'worker wrote status directly');

-- ...and the transition RPC is not a back door to it either.
savepoint sp2;
\set ON_ERROR_STOP off
select public.set_job_status(:'job_a', 'completed');
\set refused2 :ERROR
\set ON_ERROR_STOP on
rollback to savepoint sp2;
insert into probe values ('2_rpc_completed_backdoor_refused', :refused2, 'set_job_status accepted completed');

reset role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. One signature is not enough.
-- ═══════════════════════════════════════════════════════════════════════════
set role authenticated;
select set_config('request.jwt.claim.sub', :'worker_id', false);
select public.confirm_job_completion(:'job_a', 12000);
reset role;

insert into probe
select '3_one_signature_not_complete',
       status <> 'completed' and worker_completed_at is not null
         and customer_completed_at is null and payment_agreed_at is null,
       format('status=%s worker_signed=%s customer_signed=%s',
              status, worker_completed_at is not null, customer_completed_at is not null)
  from public.jobs where id = :'job_a';

insert into probe
select '4_other_side_nudged', count(*) = 1, format('%s notification(s)', count(*))
  from public.notifications
 where type = 'job_status' and data ->> 'awaiting' = 'completion'
   and user_id = :'cust_id';

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Second signature completes the WORK, but a mismatched figure is not
--    agreed money. The two facts are independent by design.
-- ═══════════════════════════════════════════════════════════════════════════
set role authenticated;
select set_config('request.jwt.claim.sub', :'cust_id', false);
select public.confirm_job_completion(:'job_a', 9000);   -- disagrees with 12000
reset role;

insert into probe
select '5_work_complete_money_disputed',
       status = 'completed' and completed_at is not null
         and payment_agreed_at is null and agreed_price_jmd is null,
       format('status=%s agreed_price=%s', status, agreed_price_jmd)
  from public.jobs where id = :'job_a';

insert into probe
select '6_mismatch_notified', count(*) = 1, format('%s notification(s)', count(*))
  from public.notifications
 where type = 'job_status' and data ->> 'awaiting' = 'payment';

set role authenticated;
select set_config('request.jwt.claim.sub', :'worker_id', false);
insert into probe
select '7_disputed_money_not_counted_as_income',
       earned_all_time_jmd = 0 and unconfirmed_all_time_jmd = 12000
         and payment_mismatches = 1,
       format('confirmed=%s unconfirmed=%s mismatches=%s',
              earned_all_time_jmd, unconfirmed_all_time_jmd, payment_mismatches)
  from public.get_my_business_stats();
reset role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. Correcting the figure resolves it.
-- ═══════════════════════════════════════════════════════════════════════════
set role authenticated;
select set_config('request.jwt.claim.sub', :'cust_id', false);
select public.confirm_job_completion(:'job_a', 12000);   -- now matches
reset role;

insert into probe
select '8_agreement_after_correction',
       payment_agreed_at is not null and agreed_price_jmd = 12000,
       format('agreed_price=%s', agreed_price_jmd)
  from public.jobs where id = :'job_a';

set role authenticated;
select set_config('request.jwt.claim.sub', :'worker_id', false);
insert into probe
select '9_confirmed_income_counted',
       earned_all_time_jmd = 12000 and unconfirmed_all_time_jmd = 0
         and payment_mismatches = 0 and jobs_completed_all_time = 1,
       format('confirmed=%s unconfirmed=%s completed=%s',
              earned_all_time_jmd, unconfirmed_all_time_jmd, jobs_completed_all_time)
  from public.get_my_business_stats();
reset role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. A previously-agreed price must UN-agree when someone revises their
--    figure. A stale agreement is worse than none: it still looks corroborated.
-- ═══════════════════════════════════════════════════════════════════════════
set role authenticated;
select set_config('request.jwt.claim.sub', :'worker_id', false);
select public.confirm_job_completion(:'job_a', 20000);
reset role;

insert into probe
select '10_agreement_revoked_on_revision',
       payment_agreed_at is null and agreed_price_jmd is null and status = 'completed',
       format('agreed_price=%s status=%s (work stays done)', agreed_price_jmd, status)
  from public.jobs where id = :'job_a';

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. Nobody else can sign your job.
-- ═══════════════════════════════════════════════════════════════════════════
set role authenticated;
select set_config('request.jwt.claim.sub', :'stranger_id', false);
savepoint sp11;
\set ON_ERROR_STOP off
select public.confirm_job_completion(:'job_a', 5000);
\set refused11 :ERROR
\set ON_ERROR_STOP on
rollback to savepoint sp11;
insert into probe values ('11_stranger_refused', :refused11, 'a stranger signed the job');
reset role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 7. Lifecycle guards.
-- ═══════════════════════════════════════════════════════════════════════════
set role authenticated;
select set_config('request.jwt.claim.sub', :'worker_id', false);
savepoint sp12;
\set ON_ERROR_STOP off
select public.confirm_job_completion(:'job_b', 100);     -- job_b is cancelled
\set refused12 :ERROR
\set ON_ERROR_STOP on
rollback to savepoint sp12;
insert into probe values ('12_cancelled_job_refused', :refused12, 'a cancelled job was completed');
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub', :'cust_id', false);
savepoint sp13;
\set ON_ERROR_STOP off
select public.set_job_status(:'job_c', 'accepted');      -- customer accepting own request
\set refused13 :ERROR
\set ON_ERROR_STOP on
rollback to savepoint sp13;
insert into probe values ('13_self_accept_refused', :refused13, 'the customer accepted their own request');
reset role;

-- The worker CAN accept it — the positive control for test 13, without which
-- that assertion would pass even if set_job_status were broken for everyone.
set role authenticated;
select set_config('request.jwt.claim.sub', :'worker_id', false);
select public.set_job_status(:'job_c', 'accepted');
reset role;

insert into probe
select '14_worker_can_accept', status = 'accepted' and responded_at is not null,
       format('status=%s', status)
  from public.jobs where id = :'job_c';

-- ═══════════════════════════════════════════════════════════════════════════
select step, case when ok then 'PASS' else '*** FAIL ***' end as result, detail
  from probe order by step;

do $$
declare v_failed int; v_total int;
begin
  select count(*) filter (where not ok), count(*) into v_failed, v_total from probe;
  if v_failed > 0 then
    raise exception '% of % assertions FAILED', v_failed, v_total;
  end if;
  raise notice 'migration 0024: all % assertions passed', v_total;
end $$;

rollback;
