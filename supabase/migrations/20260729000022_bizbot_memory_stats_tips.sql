-- MyB · 0022 — BizBot remembers, knows YOUR numbers, and has something to say
--
-- Three additions, all serving the same complaint: BizBot answered one
-- question well and then forgot you existed.
--
-- 1. Conversations persist and are titled, so a chat is a thing you can come
--    back to rather than something that evaporates on the back button.
-- 2. get_my_business_stats() — "how many jobs did I book this month" is a
--    question about the user, and the answer lives in `jobs`, not in a PDF
--    about the Companies Office. This is DETERMINISTIC on purpose: personal
--    numbers must never be paraphrased by a language model (CLAUDE.md §4.3).
-- 3. bizbot_tips — sourced "did you know" facts about running a small business
--    in Jamaica. Config rows with a citation each, never model output.

-- ── Saved conversations ────────────────────────────────────────────────────
create table if not exists public.bizbot_conversations (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  -- Taken from the first question asked, so a chat names itself.
  title      text not null default 'New chat',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists bizbot_conversations_user_idx
  on public.bizbot_conversations (user_id, updated_at desc);

create table if not exists public.bizbot_messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.bizbot_conversations (id) on delete cascade,
  role            text not null check (role in ('user', 'assistant')),
  content         text not null,
  -- The citations that came back with the answer, kept so reopening a chat
  -- still shows where the facts came from.
  sources         jsonb not null default '[]',
  created_at      timestamptz not null default now()
);

create index if not exists bizbot_messages_conversation_idx
  on public.bizbot_messages (conversation_id, created_at);

alter table public.bizbot_conversations enable row level security;
alter table public.bizbot_messages enable row level security;

-- Your chats are yours. No sharing, no admin read: someone asking BizBot
-- whether the tax man is coming for them is entitled to privacy.
drop policy if exists "bizbot conversations: own" on public.bizbot_conversations;
create policy "bizbot conversations: own"
  on public.bizbot_conversations for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "bizbot messages: own" on public.bizbot_messages;
create policy "bizbot messages: own"
  on public.bizbot_messages for all
  to authenticated
  using (exists (
    select 1 from public.bizbot_conversations c
     where c.id = conversation_id and c.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.bizbot_conversations c
     where c.id = conversation_id and c.user_id = auth.uid()
  ));

-- Keep the conversation list ordered by real activity.
create or replace function public.touch_bizbot_conversation()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.bizbot_conversations
     set updated_at = new.created_at
   where id = new.conversation_id;
  return new;
end;
$$;

drop trigger if exists bizbot_messages_touch on public.bizbot_messages;
create trigger bizbot_messages_touch
  after insert on public.bizbot_messages
  for each row execute function public.touch_bizbot_conversation();

-- ── Your own numbers ───────────────────────────────────────────────────────
-- "How many jobs did I book this month?" is a question about the user. The
-- answer is a COUNT, and a count must never be produced by a language model —
-- it either matches the database or the app is lying to somebody about their
-- own income. So BizBot answers these from here, verbatim.
create or replace function public.get_my_business_stats()
returns table (
  jobs_booked_this_month    int,
  jobs_worked_this_month    int,
  jobs_completed_all_time   int,
  earned_this_month_jmd     numeric,
  earned_all_time_jmd       numeric,
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
    (select coalesce(sum(coalesce(j.agreed_price_jmd, j.budget_max_jmd, 0)), 0) from public.jobs j, me, month
      where j.worker_id = me.id and j.status = 'completed' and j.completed_at >= month.start),
    (select coalesce(sum(coalesce(j.agreed_price_jmd, j.budget_max_jmd, 0)), 0) from public.jobs j, me
      where j.worker_id = me.id and j.status = 'completed'),
    (select coalesce(sum(coalesce(j.agreed_price_jmd, j.budget_max_jmd, 0)), 0) from public.jobs j, me, month
      where j.customer_id = me.id and j.status = 'completed' and j.completed_at >= month.start),
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

revoke execute on function public.get_my_business_stats from public, anon;
grant execute on function public.get_my_business_stats to authenticated;

-- ── "Did you know" tips ────────────────────────────────────────────────────
-- Every tip carries its source. These are shown as facts about running a
-- business in Jamaica, so an unsourced one has no business being here.
create table if not exists public.bizbot_tips (
  id          serial primary key,
  country     text not null default 'JM',
  category    text not null default 'general',
  headline    text not null,
  body        text not null,
  source_name text not null default '',
  source_url  text not null default '',
  sort_order  int not null default 100
);

alter table public.bizbot_tips enable row level security;

drop policy if exists "bizbot tips: read all" on public.bizbot_tips;
create policy "bizbot tips: read all"
  on public.bizbot_tips for select
  to authenticated
  using (true);

insert into public.bizbot_tips (category, headline, body, source_name, source_url, sort_order)
values
  ('tax',
   'GCT only starts at J$15 million',
   'You do not charge General Consumption Tax until your taxable sales pass J$15 million in a year — raised from J$10 million on 1 April 2025. Most independent workers are nowhere near it.',
   'Tax Administration Jamaica', 'https://www.jamaicatax.gov.jm/', 10),
  ('tax',
   'A TRN costs nothing',
   'Applying for a Taxpayer Registration Number is free, and once issued it never changes and never expires. It is the key that unlocks a bank account, registration and contracts.',
   'Tax Administration Jamaica', 'https://www.jamaicatax.gov.jm/', 20),
  ('registration',
   'One form notifies five agencies',
   'The BRF 1 "Super Form" at the Companies Office notifies TAJ, NIS, HEART Trust and the NHT on your behalf. Your certificate comes back with your TRN and NIS number already attached.',
   'Companies Office of Jamaica', 'https://www.orcjamaica.com/', 30),
  ('money',
   'Separate your work money',
   'Keeping business income in its own account is the single easiest thing you can do to prove your earnings later. Lenders ask for consistency, not size.',
   'Jamaica Business Development Corporation', 'https://www.jbdc.net/', 40),
  ('protection',
   'NIS is your pension when you work for yourself',
   'Self-employed people can and should contribute to the National Insurance Scheme. It is pension and injury cover that nobody else provides once you stop working for an employer.',
   'National Insurance Scheme, Ministry of Labour and Social Security', '', 50),
  ('growth',
   'A TCC opens government work',
   'A Tax Compliance Certificate is required for government contracts and most large company work. It is the difference between bidding and not being allowed to bid.',
   'Tax Administration Jamaica', 'https://www.jamaicatax.gov.jm/', 60),
  ('growth',
   'Free help already exists',
   'The JBDC offers free guidance to small businesses at every stage, and HEART/NSTA Trust offers free or subsidised certification that raises what you can charge.',
   'Jamaica Business Development Corporation', 'https://www.jbdc.net/', 70),
  ('reputation',
   'Your job history is financial evidence',
   'Completed jobs and reviews on myB are a record of income over time. Registering turns that record into something a bank can actually accept.',
   'myB', '', 80)
on conflict do nothing;

-- ── More knowledge base coverage ───────────────────────────────────────────
-- Answers were thin on the practical "what do I actually do" questions, which
-- is what people ask first.
insert into public.kb_documents (slug, title, country, topic, source_name, source_url)
values
  ('record-keeping', 'Keeping records as a self-employed worker', 'JM', 'operating',
   'Tax Administration Jamaica', 'https://www.jamaicatax.gov.jm/'),
  ('pricing-and-quoting', 'Pricing and quoting for a job', 'JM', 'operating',
   'Jamaica Business Development Corporation', 'https://www.jbdc.net/'),
  ('bank-account', 'Opening a business bank account', 'JM', 'banking',
   'Jamaica Business Development Corporation', 'https://www.jbdc.net/')
on conflict (slug) do nothing;

insert into public.kb_chunks (document_id, chunk_index, content, country, topic)
select d.id, 0,
  'Keep every receipt for things you buy for work — materials, tools, transport, phone credit used for jobs. These are business expenses, and income tax is charged on your profit, not on everything you were paid. Without receipts you cannot prove the expense and you are taxed as though it never happened. A shoebox and a notebook is enough to start; the habit matters more than the system.',
  'JM', 'operating'
  from public.kb_documents d where d.slug = 'record-keeping'
on conflict (document_id, chunk_index) do update set content = excluded.content;

insert into public.kb_chunks (document_id, chunk_index, content, country, topic)
select d.id, 1,
  'Write down what you were paid, by whom, and on what date, for every job. Three things make a record credible to a bank: it is regular, it goes back a while, and it matches your bank account. If your work money goes into its own account, your statements do most of the work for you.',
  'JM', 'operating'
  from public.kb_documents d where d.slug = 'record-keeping'
on conflict (document_id, chunk_index) do update set content = excluded.content;

insert into public.kb_chunks (document_id, chunk_index, content, country, topic)
select d.id, 0,
  'When you quote for a job, cost it in three parts: materials, your time, and transport. Price your time by the hour or by the day and be consistent about it, because a customer who is quoted differently for similar work loses trust. Quote a range when the job is uncertain and say what would push it to the top of the range.',
  'JM', 'operating'
  from public.kb_documents d where d.slug = 'pricing-and-quoting'
on conflict (document_id, chunk_index) do update set content = excluded.content;

insert into public.kb_chunks (document_id, chunk_index, content, country, topic)
select d.id, 1,
  'Agree the price before the work starts and put it in writing, even a message. Most disputes in informal work are not about quality — they are about a number that was never agreed out loud. Booking through myB records the agreed price on the job for both sides.',
  'JM', 'operating'
  from public.kb_documents d where d.slug = 'pricing-and-quoting'
on conflict (document_id, chunk_index) do update set content = excluded.content;

insert into public.kb_chunks (document_id, chunk_index, content, country, topic)
select d.id, 0,
  'To open a business bank account in Jamaica you will generally need your TRN, valid photo identification, proof of address, and — if you trade under a business name — your certificate of business name registration from the Companies Office. Requirements vary between banks, so call the branch first and ask exactly what to bring.',
  'JM', 'banking'
  from public.kb_documents d where d.slug = 'bank-account'
on conflict (document_id, chunk_index) do update set content = excluded.content;

insert into public.kb_chunks (document_id, chunk_index, content, country, topic)
select d.id, 1,
  'A separate account is not a legal requirement for a sole trader, but it is the difference between being able to prove your income and not. When you apply for a loan, a lender looks for money coming in regularly over time. Mixing work money with household money hides exactly the pattern you want them to see.',
  'JM', 'banking'
  from public.kb_documents d where d.slug = 'bank-account'
on conflict (document_id, chunk_index) do update set content = excluded.content;

-- How long things take — asked constantly, and previously unanswered.
insert into public.kb_chunks (document_id, chunk_index, content, country, topic)
select d.id, 102,
  'Applying for a TRN can be done at any TAJ tax office, and the application can be started online through the TAJ website. Processing is normally quick — the office can tell you when to collect the card — but allow a few working days. There is no fee.',
  'JM', d.topic
  from public.kb_documents d where d.slug = 'trn'
on conflict (document_id, chunk_index) do update set content = excluded.content;

-- ── Retrieval ranking: the document's TITLE is a strong signal ─────────────
-- Chunk-body ts_rank alone put "GCT basics" above "Keeping records" for
-- "what records should I keep", and a business-name doc above the TRN doc for
-- "how long does a TRN take". Both because a longer chunk that mentions a term
-- in passing can out-rank a document that is ABOUT it.
--
-- So the title (and topic) now contribute. Same OR semantics, same shape —
-- one extra term in the score.
create or replace function public.search_kb(
  p_question text,
  p_country  text default 'JM',
  p_limit    int default 5
)
returns table (
  content     text,
  title       text,
  topic       text,
  source_name text,
  source_url  text,
  rank        real
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with q as (
    -- OR semantics: a question rarely repeats every word of the source text.
    select nullif(replace(plainto_tsquery('english', coalesce(p_question, ''))::text,
                          ' & ', ' | '), '')::tsquery as tsq
  )
  select c.content, d.title, c.topic, d.source_name, d.source_url,
         (
           ts_rank(c.search_vector, q.tsq)
           -- A title match means the document is ABOUT the question, not
           -- merely mentioning it. Weighted to dominate a passing mention
           -- without swamping a genuinely rich body match.
           + 2.0 * ts_rank(to_tsvector('english', d.title), q.tsq)
           + 0.5 * ts_rank(to_tsvector('english', coalesce(c.topic, '')), q.tsq)
         )::real as rank
    from public.kb_chunks c
    join public.kb_documents d on d.id = c.document_id
    cross join q
   where c.country = coalesce(p_country, 'JM')
     and q.tsq is not null
     and (
       c.search_vector @@ q.tsq
       -- A question naming the document by title should find it even when the
       -- chunk body words differ ("how long does a TRN take").
       or to_tsvector('english', d.title) @@ q.tsq
     )
   order by rank desc
   limit greatest(1, least(p_limit, 12));
$$;
