-- MyB · 0015 — BizBot retrieval without embeddings + a real formalization pathway
--
-- BizBot could not answer anything: retrieval was pgvector-only, the KB was
-- empty, and the whole path went through a Python service that has to be
-- running. Retrieval now works on Postgres full-text search, so BizBot answers
-- with nothing but Supabase + an LLM key. Semantic search still layers on top
-- when embeddings exist.

-- ── 1. Full-text retrieval over the knowledge base ──────────────────────────
alter table public.kb_chunks
  add column if not exists search_vector tsvector
  generated always as (to_tsvector('english', coalesce(content, ''))) stored;

create index if not exists kb_chunks_search_idx
  on public.kb_chunks using gin (search_vector);

-- Retrieve the passages most relevant to a question. Country filter is always
-- applied (SR-9) so the KB stays swappable per country.
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
         ts_rank(c.search_vector, q.tsq) as rank
    from public.kb_chunks c
    join public.kb_documents d on d.id = c.document_id
    cross join q
   where c.country = coalesce(p_country, 'JM')
     and q.tsq is not null
     and c.search_vector @@ q.tsq
   order by rank desc
   limit greatest(1, least(p_limit, 12));
$$;

-- ── 2. Formalization pathway, rebuilt ───────────────────────────────────────
-- The old checklist was a flat list of 7 steps with no sense of sequence,
-- effort or payoff. Research (COJ / TAJ, 2026) changes the shape of it:
--   · BRF1 is a "Super Form" — one submission registers the business name AND
--     notifies TAJ, NIS, HEART and NHT, so several "steps" are really one.
--   · The GCT registration threshold is J$15M/year (raised April 2025), so
--     almost every informal worker is far below it and does NOT need to
--     charge GCT. Saying so removes a real fear.
-- Steps now carry a stage, a plain-language payoff, and whether they are
-- required or optional, so the app can show a journey rather than a to-do list.

alter table public.checklist_items add column if not exists stage text not null default 'setup';
alter table public.checklist_items add column if not exists benefit text not null default '';
alter table public.checklist_items add column if not exists required boolean not null default true;
alter table public.checklist_items add column if not exists official_url text not null default '';

update public.checklist_items set
  stage = case
    when step_order <= 2 then 'identity'
    when step_order <= 4 then 'register'
    when step_order <= 6 then 'operate'
    else 'grow'
  end;

update public.checklist_items
   set benefit = 'Your TRN is the key to everything else — bank account, registration, contracts.',
       official_url = 'https://www.jamaicatax.gov.jm/',
       stage = 'identity'
 where title = 'Get your TRN';

update public.checklist_items
   set benefit = 'Separating work money is what proves your income when you apply for a loan.',
       stage = 'identity'
 where title = 'Open a bank account for your work';

update public.checklist_items
   set description = 'Register at the Companies Office using the BRF 1 "Super Form". One submission registers your business name and notifies TAJ, NIS, HEART and NHT — your certificate comes back with your TRN and NIS number attached.',
       benefit = 'A registered name lets you bid for company and government work, and open a business account.',
       official_url = 'https://www.orcjamaica.com/',
       est_cost_jmd = 2500,
       stage = 'register'
 where title = 'Register your business name';

update public.checklist_items
   set description = 'The BRF 1 already notifies TAJ that you are in business. This step is confirming your self-employed status so you can file returns and request a TCC later.',
       benefit = 'Filing keeps you compliant and builds the record lenders ask for.',
       stage = 'register'
 where title = 'Register as self-employed with TAJ';

update public.checklist_items
   set description = 'The BRF 1 notifies NIS automatically. Confirm your contributions are set up — as a self-employed person you pay your own.',
       benefit = 'NIS is your pension and injury cover. Nobody else provides it when you work for yourself.',
       stage = 'operate'
 where title = 'Register with NIS';

update public.checklist_items
   set benefit = 'Your myB job history is already a record of income — records turn it into evidence a bank accepts.',
       stage = 'operate'
 where title = 'Keep simple monthly records';

update public.checklist_items
   set benefit = 'A TCC is required for government contracts and most large company work.',
       official_url = 'https://www.jamaicatax.gov.jm/',
       stage = 'grow',
       required = false
 where title = 'Get a Tax Compliance Certificate (TCC)';

update public.checklist_items
   set stage = 'grow', required = false,
       benefit = 'Certification lets you sign off work that unqualified competitors legally cannot.'
 where trade_slug is not null;

-- One more step people always ask about, so BizBot is not the only place the
-- GCT threshold appears.
insert into public.checklist_items
  (country, trade_slug, parish, step_order, title, description, agency, documents,
   est_cost_jmd, est_days, stage, benefit, required, official_url)
select 'JM', null, null, 9,
  'Check whether GCT applies to you',
  'You only register for GCT once your sales pass J$15 million in a year (raised from J$10M in April 2025). Below that you do not charge GCT at all. If you do cross it, you must register within 21 days.',
  'TAJ', '["TRN", "Sales records"]'::jsonb,
  0, 1, 'grow',
  'Most independent workers are well below the threshold — knowing that stops you overcharging or worrying.',
  false, 'https://www.jamaicatax.gov.jm/general-consumption-tax1/'
 where not exists (
   select 1 from public.checklist_items where title = 'Check whether GCT applies to you');

-- Checklist resolver returns the new journey fields. Dropped first because a
-- function's return type cannot be widened in place.
drop function if exists public.get_worker_checklist(uuid);

create or replace function public.get_worker_checklist(p_user uuid)
returns table (
  id int, step_order int, title text, description text, agency text,
  documents jsonb, est_cost_jmd numeric, est_days int, done boolean, done_at timestamptz,
  stage text, benefit text, required boolean, official_url text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select ci.id, ci.step_order, ci.title, ci.description, ci.agency,
         ci.documents, ci.est_cost_jmd, ci.est_days,
         coalesce(cp.done, false), cp.done_at,
         ci.stage, ci.benefit, ci.required, ci.official_url
    from public.checklist_items ci
   -- SECURITY DEFINER guard: callers may only resolve their own checklist.
   cross join (select 1 where p_user = auth.uid() or public.is_admin()) guard
    left join public.checklist_progress cp
      on cp.item_id = ci.id and cp.user_id = p_user
   where ci.country = 'JM'
     and (ci.trade_slug is null or ci.trade_slug in
           (select trade_slug from public.service_descriptions where user_id = p_user))
     and (ci.parish is null or ci.parish =
           (select parish from public.worker_profiles where user_id = p_user))
   order by ci.step_order;
$$;
