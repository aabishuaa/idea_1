-- MyB · 0004 — job lifecycle, reviews, disputes
-- FR-JOB-1..4, FR-REP-5. Payments are ROADMAP — no payment columns beyond an
-- indicative agreed price.

create type public.job_status as enum
  ('requested', 'accepted', 'declined', 'in_progress', 'completed', 'cancelled');

create type public.job_urgency as enum ('low', 'normal', 'high', 'emergency');

create table public.jobs (
  id               uuid primary key default gen_random_uuid(),
  customer_id      uuid not null references public.profiles (id) on delete cascade,
  worker_id        uuid not null references public.worker_profiles (user_id) on delete cascade,
  service_id       uuid references public.service_descriptions (id) on delete set null,
  title            text not null,
  description      text not null default '',
  trade_slug       text references public.trades (slug),
  parish           text,
  location         geography(point, 4326),
  urgency          public.job_urgency not null default 'normal',
  budget_min_jmd   numeric(12,2),
  budget_max_jmd   numeric(12,2),
  agreed_price_jmd numeric(12,2),
  status           public.job_status not null default 'requested',
  requested_at     timestamptz not null default now(),
  responded_at     timestamptz,
  started_at       timestamptz,
  completed_at     timestamptz,
  cancelled_at     timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (customer_id <> worker_id)
);

create index jobs_customer_idx on public.jobs (customer_id, status);
create index jobs_worker_idx on public.jobs (worker_id, status);
create index jobs_trade_parish_idx on public.jobs (trade_slug, parish);

create trigger jobs_updated_at
  before update on public.jobs
  for each row execute function public.set_updated_at();

-- Legal state machine (FR-JOB-2): requested → accepted|declined|cancelled;
-- accepted → in_progress|cancelled; in_progress → completed|cancelled.
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
    (old.status = 'accepted'    and new.status in ('in_progress', 'cancelled')) or
    (old.status = 'in_progress' and new.status in ('completed', 'cancelled'))
  ) then
    raise exception 'invalid job transition: % -> %', old.status, new.status;
  end if;

  -- Who may drive which transition.
  if new.status in ('accepted', 'declined', 'in_progress', 'completed') and auth.uid() <> old.worker_id then
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
  if new.status = 'completed'   then new.completed_at = coalesce(new.completed_at, now()); end if;
  if new.status = 'cancelled'   then new.cancelled_at = coalesce(new.cancelled_at, now()); end if;

  return new;
end;
$$;

create trigger jobs_enforce_transition
  before update of status on public.jobs
  for each row execute function public.enforce_job_transition();

alter table public.jobs enable row level security;

create policy "jobs: participants read"
  on public.jobs for select
  to authenticated
  using (customer_id = auth.uid() or worker_id = auth.uid() or public.is_admin());

create policy "jobs: customer creates request"
  on public.jobs for insert
  to authenticated
  with check (customer_id = auth.uid() and status = 'requested');

create policy "jobs: participants update"
  on public.jobs for update
  to authenticated
  using (customer_id = auth.uid() or worker_id = auth.uid())
  with check (customer_id = auth.uid() or worker_id = auth.uid());

-- Reviews (FR-JOB-3): one per completed job, written by the customer.
create table public.reviews (
  id          uuid primary key default gen_random_uuid(),
  job_id      uuid not null unique references public.jobs (id) on delete cascade,
  worker_id   uuid not null references public.worker_profiles (user_id) on delete cascade,
  reviewer_id uuid not null references public.profiles (id) on delete cascade,
  rating      int not null check (rating between 1 and 5),
  comment     text not null default '',
  created_at  timestamptz not null default now()
);

create index reviews_worker_idx on public.reviews (worker_id, created_at desc);

alter table public.reviews enable row level security;

create policy "reviews: read all"
  on public.reviews for select
  to authenticated
  using (true);

create policy "reviews: customer of completed job"
  on public.reviews for insert
  to authenticated
  with check (
    reviewer_id = auth.uid()
    and exists (
      select 1 from public.jobs j
      where j.id = job_id
        and j.customer_id = auth.uid()
        and j.worker_id = reviews.worker_id
        and j.status = 'completed'
    )
  );

-- Disputes (FR-REP-5): basic recording; affects reputation.
create table public.disputes (
  id          uuid primary key default gen_random_uuid(),
  job_id      uuid not null references public.jobs (id) on delete cascade,
  worker_id   uuid not null references public.worker_profiles (user_id) on delete cascade,
  raised_by   uuid not null references public.profiles (id) on delete cascade,
  reason      text not null,
  status      text not null default 'open' check (status in ('open', 'resolved', 'dismissed')),
  created_at  timestamptz not null default now(),
  resolved_at timestamptz
);

create index disputes_worker_idx on public.disputes (worker_id);

alter table public.disputes enable row level security;

create policy "disputes: participants + admin read"
  on public.disputes for select
  to authenticated
  using (
    raised_by = auth.uid() or worker_id = auth.uid() or public.is_admin()
    or exists (select 1 from public.jobs j where j.id = job_id and j.customer_id = auth.uid())
  );

create policy "disputes: participant raises"
  on public.disputes for insert
  to authenticated
  with check (
    raised_by = auth.uid()
    and exists (
      select 1 from public.jobs j
      where j.id = job_id and (j.customer_id = auth.uid() or j.worker_id = auth.uid())
    )
  );
