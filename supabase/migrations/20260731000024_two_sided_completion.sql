-- MyB · 0024 — a job is finished when BOTH sides say it is, and paid for the
--                amount BOTH sides name.
--
-- Until now either participant could write `status = 'completed'` straight to
-- the row. That is self-attestation: a worker could complete their own jobs all
-- afternoon and every one of them would count toward jobs_completed, feed
-- compute_reputation, and appear on the reputation record a lender is being
-- asked to trust. The entire value of that record rests on it being something
-- the holder cannot simply assert.
--
-- Same argument for money. Payments are out of MVP scope and stay out — myB
-- moves no funds here — but the RECORD of what was paid is exactly the
-- alternative credit data this product exists to build, so it has to be
-- corroborated rather than claimed.
--
-- Two independent facts, each needing both signatures:
--   1. the work is done;
--   2. this is what was paid for it.
-- They are deliberately separate. People finish a job and settle up later, and
-- disagreeing about the money must not un-finish the work.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Columns
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.jobs add column if not exists customer_completed_at timestamptz;
alter table public.jobs add column if not exists worker_completed_at   timestamptz;
alter table public.jobs add column if not exists customer_amount_jmd   numeric(12,2);
alter table public.jobs add column if not exists worker_amount_jmd     numeric(12,2);
/*
  Set only when both sides have named the SAME figure. Null covers three
  different situations — nobody has said, one has said, or they disagree — and
  the UI distinguishes them from the two amount columns. What matters here is
  that this timestamp is never true unless the figure is corroborated.
*/
alter table public.jobs add column if not exists payment_agreed_at     timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'jobs_amounts_non_negative') then
    alter table public.jobs add constraint jobs_amounts_non_negative
      check (
        (customer_amount_jmd is null or customer_amount_jmd >= 0)
        and (worker_amount_jmd is null or worker_amount_jmd >= 0)
      );
  end if;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Backfill, so the seeded history does not all become "unconfirmed".
--
-- Existing completed jobs were completed under the old single-signature rule.
-- Treating them as corroborated is the honest reading: they are historical
-- demo data, not claims anyone is making now.
-- ─────────────────────────────────────────────────────────────────────────────
update public.jobs
   set customer_completed_at = coalesce(customer_completed_at, completed_at),
       worker_completed_at   = coalesce(worker_completed_at, completed_at),
       customer_amount_jmd   = coalesce(customer_amount_jmd, agreed_price_jmd),
       worker_amount_jmd     = coalesce(worker_amount_jmd, agreed_price_jmd),
       payment_agreed_at     = case
                                 when payment_agreed_at is not null then payment_agreed_at
                                 when agreed_price_jmd is not null then completed_at
                               end
 where status = 'completed'
   and completed_at is not null;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Lock the state machine away from the client.
--
-- This is the actual security fix. Everything below is only meaningful because
-- the client can no longer write `status` itself.
-- ─────────────────────────────────────────────────────────────────────────────
revoke update on public.jobs from authenticated, anon;
-- The date window is the one thing a customer may still edit directly; it
-- carries no trust weight and its trigger keeps urgency honest (0023).
grant update (needed_from, needed_by) on public.jobs to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3b. The transition trigger has to learn the new rule.
--
-- Two clauses in it are now actively wrong:
--
--   · "only the worker can set status completed" — that IS the rule this
--     migration replaces. Under two signatures the customer is very often the
--     one whose confirmation tips the job over, and the trigger would reject
--     exactly that. The guard is safe to drop because completion no longer
--     comes from a person at all: UPDATE on `status` is revoked from clients,
--     so the only writer is confirm_job_completion, which enforces something
--     strictly stronger than "the worker asked for it".
--
--   · accepted -> completed was invalid, forcing a separate "start work" tap
--     before a job could be finished. Plenty of jobs are agreed and done in one
--     visit, and making someone press Start on work they have already finished
--     is the kind of friction that gets a step skipped or faked. started_at is
--     still stamped, so the record keeps a start time either way.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.enforce_job_transition()
returns trigger
language plpgsql
as $$
begin
  if old.status = new.status then
    return new;
  end if;

  if not (
    (old.status = 'requested'   and new.status in ('accepted', 'declined', 'cancelled')) or
    (old.status = 'accepted'    and new.status in ('in_progress', 'completed', 'cancelled')) or
    (old.status = 'in_progress' and new.status in ('completed', 'cancelled'))
  ) then
    raise exception 'invalid job transition: % -> %', old.status, new.status;
  end if;

  -- Who may drive which transition. 'completed' is deliberately absent: it is
  -- reached only via confirm_job_completion, which requires BOTH participants.
  if new.status in ('accepted', 'declined', 'in_progress') and auth.uid() <> old.worker_id then
    raise exception 'only the worker can set status %', new.status;
  end if;
  if new.status = 'cancelled' and auth.uid() not in (old.worker_id, old.customer_id) then
    raise exception 'only a participant can cancel';
  end if;

  -- Stamp lifecycle timestamps (response time feeds reputation — FR-REP-1).
  if new.status in ('accepted', 'declined') and new.responded_at is null then
    new.responded_at = now();
  end if;
  if new.status = 'in_progress' then new.started_at = coalesce(new.started_at, now()); end if;
  if new.status = 'completed' then
    new.completed_at = coalesce(new.completed_at, now());
    -- Finishing straight from 'accepted' still means the work started.
    new.started_at   = coalesce(new.started_at, now());
  end if;
  if new.status = 'cancelled'   then new.cancelled_at = coalesce(new.cancelled_at, now()); end if;

  return new;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. The transitions that are NOT completion.
-- ─────────────────────────────────────────────────────────────────────────────
/**
 * accept / decline / start / cancel.
 *
 * Refuses 'completed' outright: there is exactly one route to completed and it
 * is confirm_job_completion. Leaving a second door open would make the whole
 * two-signature rule decorative.
 */
create or replace function public.set_job_status(
  p_job    uuid,
  p_status text
)
returns public.jobs
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_job  public.jobs;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;

  select * into v_job from public.jobs where id = p_job for update;
  if not found then
    raise exception 'job not found';
  end if;
  if v_user <> v_job.customer_id and v_user <> v_job.worker_id then
    raise exception 'not your job';
  end if;

  if p_status = 'completed' then
    raise exception 'completion requires both sides — use confirm_job_completion';
  end if;
  if p_status not in ('accepted', 'declined', 'in_progress', 'cancelled') then
    raise exception 'unsupported status: %', p_status;
  end if;

  -- Only the worker answers a request or starts the work; either side may
  -- cancel. A customer accepting their own request would be self-dealing of
  -- the same kind this migration exists to stop.
  if p_status in ('accepted', 'declined', 'in_progress') and v_user <> v_job.worker_id then
    raise exception 'only the worker can do that';
  end if;

  update public.jobs
     set status       = p_status::public.job_status,
         responded_at = case
                          when p_status in ('accepted', 'declined')
                            then coalesce(responded_at, now())
                          else responded_at
                        end,
         started_at   = case when p_status = 'in_progress' then coalesce(started_at, now())
                             else started_at end,
         cancelled_at = case when p_status = 'cancelled' then now() else cancelled_at end
   where id = p_job
  returning * into v_job;

  return v_job;
end;
$$;

revoke all on function public.set_job_status(uuid, text) from public, anon;
grant execute on function public.set_job_status(uuid, text) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Two-sided completion, and two-sided payment confirmation.
-- ─────────────────────────────────────────────────────────────────────────────
/**
 * Record the caller's signature on this job.
 *
 * Idempotent, and re-callable: an amount can be corrected after the fact, which
 * is how a disagreement gets resolved. Whoever moves first is recorded and the
 * other side is nudged; the job only reaches 'completed' when both have signed,
 * and the price is only 'agreed' when both name the same figure.
 *
 * p_amount is optional — "the work is done, we haven't settled up yet" is a
 * real and common state, and forcing a number would just get a fabricated one.
 */
create or replace function public.confirm_job_completion(
  p_job    uuid,
  p_amount numeric default null
)
returns public.jobs
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user      uuid := auth.uid();
  v_job       public.jobs;
  v_is_customer boolean;
  v_other     uuid;
  v_both_done boolean;
  v_agreed    boolean;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;
  if p_amount is not null and p_amount < 0 then
    raise exception 'amount cannot be negative';
  end if;

  select * into v_job from public.jobs where id = p_job for update;
  if not found then
    raise exception 'job not found';
  end if;

  v_is_customer := (v_user = v_job.customer_id);
  if not v_is_customer and v_user <> v_job.worker_id then
    raise exception 'not your job';
  end if;

  -- You cannot finish something that was never started, declined, or called off.
  if v_job.status not in ('accepted', 'in_progress', 'completed') then
    raise exception 'job is % — nothing to confirm', v_job.status;
  end if;

  v_other := case when v_is_customer then v_job.worker_id else v_job.customer_id end;

  update public.jobs
     set customer_completed_at = case
           when v_is_customer then coalesce(customer_completed_at, now())
           else customer_completed_at end,
         worker_completed_at = case
           when not v_is_customer then coalesce(worker_completed_at, now())
           else worker_completed_at end,
         -- The amount is overwritten rather than coalesced: a correction has to
         -- be able to move it, or a mistyped figure would deadlock the pair.
         customer_amount_jmd = case
           when v_is_customer and p_amount is not null then p_amount
           else customer_amount_jmd end,
         worker_amount_jmd = case
           when not v_is_customer and p_amount is not null then p_amount
           else worker_amount_jmd end
   where id = p_job
  returning * into v_job;

  v_both_done := v_job.customer_completed_at is not null
             and v_job.worker_completed_at is not null;

  v_agreed := v_job.customer_amount_jmd is not null
          and v_job.worker_amount_jmd is not null
          and v_job.customer_amount_jmd = v_job.worker_amount_jmd;

  update public.jobs
     set status = case when v_both_done then 'completed'::public.job_status else status end,
         -- The job finished when the SECOND signature landed, not the first.
         completed_at = case when v_both_done then coalesce(completed_at, now())
                             else completed_at end,
         /*
           Both derived strictly from current agreement, and cleared when it
           breaks. If someone corrects their figure and the two no longer match,
           the previously "agreed" price must stop being agreed — a stale
           agreement is worse than none, because it looks corroborated.
         */
         agreed_price_jmd  = case when v_agreed then v_job.customer_amount_jmd else null end,
         payment_agreed_at = case
                               when v_agreed then coalesce(payment_agreed_at, now())
                               else null
                             end
   where id = p_job
  returning * into v_job;

  -- Reputation is recomputed by the existing trigger path on review/completion;
  -- recompute here too so jobs_completed moves the moment the job actually
  -- completes rather than waiting for a review that may never come.
  if v_both_done then
    perform public.compute_reputation(v_job.worker_id);
  end if;

  -- Nudge the other side. A job stuck on one signature is the failure mode of
  -- this whole design, so the other person has to be told they are the hold-up.
  if not v_both_done then
    insert into public.notifications (user_id, type, title, body, data)
    values (
      v_other,
      'job_status',
      'Confirm this job is done',
      case when v_is_customer
        then 'The customer marked "' || v_job.title || '" as complete. Confirm it to finish the job and add it to your record.'
        else 'Your pro marked "' || v_job.title || '" as complete. Confirm it to finish the job.'
      end,
      jsonb_build_object('job_id', v_job.id, 'awaiting', 'completion')
    );
  elsif not v_agreed
        and v_job.customer_amount_jmd is not null
        and v_job.worker_amount_jmd is not null then
    insert into public.notifications (user_id, type, title, body, data)
    values (
      v_other,
      'job_status',
      'The amounts do not match',
      'You and the other side recorded different amounts for "' || v_job.title ||
      '". Until they match it will not count as confirmed income.',
      jsonb_build_object('job_id', v_job.id, 'awaiting', 'payment')
    );
  end if;

  return v_job;
end;
$$;

revoke all on function public.confirm_job_completion(uuid, numeric) from public, anon;
grant execute on function public.confirm_job_completion(uuid, numeric) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Stats that distinguish confirmed income from claimed income.
--
-- The old version summed `coalesce(agreed_price_jmd, budget_max_jmd, 0)` — so a
-- job with no agreed price counted the customer's BUDGET CEILING as earnings.
-- That reported a hoped-for number as income, on the same screen the product
-- offers to a lender as evidence. Confirmed and unconfirmed are now separate,
-- and the budget fallback is gone.
-- ─────────────────────────────────────────────────────────────────────────────
drop function if exists public.get_my_business_stats();

create or replace function public.get_my_business_stats()
returns table (
  jobs_booked_this_month    int,
  jobs_worked_this_month    int,
  jobs_completed_all_time   int,
  /* Both sides named the same figure. This is the number a lender may read. */
  earned_this_month_jmd     numeric,
  earned_all_time_jmd       numeric,
  /* Completed, but the amount is unagreed or unstated. Never mixed in above. */
  unconfirmed_this_month_jmd numeric,
  unconfirmed_all_time_jmd   numeric,
  jobs_awaiting_my_confirmation int,
  jobs_awaiting_them            int,
  payment_mismatches            int,
  spent_this_month_jmd      numeric,
  rating_avg                numeric,
  rating_count              int,
  reputation                numeric,
  active_jobs               int,
  pending_requests          int,
  formalization_done        int,
  formalization_total       int,
  identity_verified         boolean,
  member_since              timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with me as (select auth.uid() as id),
  month as (select date_trunc('month', now()) as start)
  select
    (select count(*)::int from public.jobs j, me, month
      where j.customer_id = me.id and j.requested_at >= month.start),
    (select count(*)::int from public.jobs j, me, month
      where j.worker_id = me.id and j.requested_at >= month.start),
    (select count(*)::int from public.jobs j, me
      where j.worker_id = me.id and j.status = 'completed'),

    -- Confirmed income: both signatures on the figure.
    (select coalesce(sum(j.agreed_price_jmd), 0) from public.jobs j, me, month
      where j.worker_id = me.id and j.payment_agreed_at is not null
        and j.completed_at >= month.start),
    (select coalesce(sum(j.agreed_price_jmd), 0) from public.jobs j, me
      where j.worker_id = me.id and j.payment_agreed_at is not null),

    -- Completed work whose price nobody has corroborated. Shown, never summed
    -- into the number above. Uses the worker's own figure where they gave one.
    (select coalesce(sum(coalesce(j.worker_amount_jmd, 0)), 0) from public.jobs j, me, month
      where j.worker_id = me.id and j.status = 'completed'
        and j.payment_agreed_at is null and j.completed_at >= month.start),
    (select coalesce(sum(coalesce(j.worker_amount_jmd, 0)), 0) from public.jobs j, me
      where j.worker_id = me.id and j.status = 'completed' and j.payment_agreed_at is null),

    -- Waiting on me.
    (select count(*)::int from public.jobs j, me
      where j.status in ('accepted', 'in_progress')
        and ((j.worker_id = me.id and j.worker_completed_at is null
              and j.customer_completed_at is not null)
          or (j.customer_id = me.id and j.customer_completed_at is null
              and j.worker_completed_at is not null))),
    -- Waiting on them.
    (select count(*)::int from public.jobs j, me
      where j.status in ('accepted', 'in_progress')
        and ((j.worker_id = me.id and j.worker_completed_at is not null
              and j.customer_completed_at is null)
          or (j.customer_id = me.id and j.customer_completed_at is not null
              and j.worker_completed_at is null))),
    -- Both named a figure and they differ.
    (select count(*)::int from public.jobs j, me
      where (j.worker_id = me.id or j.customer_id = me.id)
        and j.customer_amount_jmd is not null and j.worker_amount_jmd is not null
        and j.customer_amount_jmd <> j.worker_amount_jmd),

    (select coalesce(sum(j.agreed_price_jmd), 0) from public.jobs j, me, month
      where j.customer_id = me.id and j.payment_agreed_at is not null
        and j.completed_at >= month.start),
    (select coalesce(w.rating_avg, 0) from public.worker_profiles w, me where w.user_id = me.id),
    (select coalesce(w.rating_count, 0) from public.worker_profiles w, me where w.user_id = me.id),
    (select coalesce(w.reputation, 0) from public.worker_profiles w, me where w.user_id = me.id),
    (select count(*)::int from public.jobs j, me
      where (j.worker_id = me.id or j.customer_id = me.id)
        and j.status in ('accepted', 'in_progress')),
    (select count(*)::int from public.jobs j, me
      where j.worker_id = me.id and j.status = 'requested'),
    (select count(*)::int from public.checklist_progress cp, me
      where cp.user_id = me.id and cp.done),
    (select count(*)::int from public.checklist_items ci where ci.country = 'JM'),
    (select coalesce(p.identity_verified, false) from public.profiles p, me where p.id = me.id),
    (select p.created_at from public.profiles p, me where p.id = me.id);
$$;

revoke all on function public.get_my_business_stats() from public, anon;
grant execute on function public.get_my_business_stats() to authenticated;
