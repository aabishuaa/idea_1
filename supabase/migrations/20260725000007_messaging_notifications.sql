-- MyB · 0007 — realtime messaging + notifications + push tokens
-- FR-MSG-1/2. Chat rides Supabase Realtime; push via Expo Push.

create table public.threads (
  id              uuid primary key default gen_random_uuid(),
  customer_id     uuid not null references public.profiles (id) on delete cascade,
  worker_id       uuid not null references public.profiles (id) on delete cascade,
  job_id          uuid references public.jobs (id) on delete set null,
  last_message_at timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  unique (customer_id, worker_id),
  check (customer_id <> worker_id)
);

alter table public.threads enable row level security;

create policy "threads: participants"
  on public.threads for select
  to authenticated
  using (customer_id = auth.uid() or worker_id = auth.uid());

create policy "threads: participant creates"
  on public.threads for insert
  to authenticated
  with check (customer_id = auth.uid() or worker_id = auth.uid());

create table public.messages (
  id         uuid primary key default gen_random_uuid(),
  thread_id  uuid not null references public.threads (id) on delete cascade,
  sender_id  uuid not null references public.profiles (id) on delete cascade,
  body       text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now(),
  read_at    timestamptz
);

create index messages_thread_idx on public.messages (thread_id, created_at desc);

alter table public.messages enable row level security;

create policy "messages: thread participants read"
  on public.messages for select
  to authenticated
  using (exists (
    select 1 from public.threads t
    where t.id = thread_id and (t.customer_id = auth.uid() or t.worker_id = auth.uid())
  ));

create policy "messages: participant sends"
  on public.messages for insert
  to authenticated
  with check (
    sender_id = auth.uid()
    and exists (
      select 1 from public.threads t
      where t.id = thread_id and (t.customer_id = auth.uid() or t.worker_id = auth.uid())
    )
  );

create policy "messages: recipient marks read"
  on public.messages for update
  to authenticated
  using (sender_id <> auth.uid() and exists (
    select 1 from public.threads t
    where t.id = thread_id and (t.customer_id = auth.uid() or t.worker_id = auth.uid())
  ))
  with check (true);

revoke update on public.messages from authenticated, anon;
grant update (read_at) on public.messages to authenticated;

create or replace function public.bump_thread_activity()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.threads set last_message_at = new.created_at where id = new.thread_id;
  return new;
end;
$$;

create trigger messages_bump_thread
  after insert on public.messages
  for each row execute function public.bump_thread_activity();

-- In-app notifications (job requests, status changes, formalization suggestions).
create table public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  type       text not null check (type in
               ('job_request', 'job_status', 'new_message', 'new_review',
                'formalization_suggestion', 'verification_result', 'system')),
  title      text not null,
  body       text not null default '',
  data       jsonb not null default '{}',
  read_at    timestamptz,
  created_at timestamptz not null default now()
);

create index notifications_user_idx on public.notifications (user_id, created_at desc);

alter table public.notifications enable row level security;

create policy "notifications: read own"
  on public.notifications for select
  to authenticated
  using (user_id = auth.uid());

create policy "notifications: mark own read"
  on public.notifications for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

revoke update on public.notifications from authenticated, anon;
grant update (read_at) on public.notifications to authenticated;

-- Expo push tokens.
create table public.push_tokens (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  token      text not null,
  platform   text not null default 'unknown' check (platform in ('ios', 'android', 'unknown')),
  updated_at timestamptz not null default now(),
  primary key (user_id, token)
);

alter table public.push_tokens enable row level security;

create policy "push_tokens: manage own"
  on public.push_tokens for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Notify on job lifecycle events (FR-MSG-2). SECURITY DEFINER so a customer's
-- insert can create the worker's notification despite RLS.
create or replace function public.notify_job_event()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.notifications (user_id, type, title, body, data)
    values (new.worker_id, 'job_request', 'New job request', new.title,
            jsonb_build_object('job_id', new.id));
  elsif tg_op = 'UPDATE' and old.status is distinct from new.status then
    -- Tell the counterparty about the transition.
    insert into public.notifications (user_id, type, title, body, data)
    values (
      case when auth.uid() = new.worker_id then new.customer_id else new.worker_id end,
      'job_status',
      'Job ' || replace(new.status::text, '_', ' '),
      new.title,
      jsonb_build_object('job_id', new.id, 'status', new.status)
    );
  end if;
  return new;
end;
$$;

create trigger jobs_notify
  after insert or update of status on public.jobs
  for each row execute function public.notify_job_event();

-- Realtime: chat + notifications stream to the app.
alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.notifications;
