-- MyB · 0008 — BizBot structured pathway (deterministic) + auto-suggest
-- FR-BIZ-1..8. CRITICAL BOUNDARY: everything here is config tables + business
-- logic. RAG (0009) only answers open questions — checklists and required-document
-- lookups are NEVER routed through RAG.

-- Readiness questionnaire (FR-BIZ-1): config-driven, deterministic scoring.
create table public.questionnaire_items (
  id         serial primary key,
  country    text not null default 'JM',
  sort_order int not null,
  question   text not null,
  help_text  text not null default '',
  -- Options with deterministic points, e.g. [{"label":"Yes","points":2}, ...]
  options    jsonb not null
);

alter table public.questionnaire_items enable row level security;
create policy "questionnaire: read" on public.questionnaire_items for select to authenticated using (true);

-- Trade/parish-tailored step + document checklist (FR-BIZ-3). Config, not RAG.
-- NULL trade_slug/parish = applies to all trades/parishes in the country.
create table public.checklist_items (
  id          serial primary key,
  country     text not null default 'JM',
  trade_slug  text references public.trades (slug),
  parish      text,
  step_order  int not null,
  title       text not null,
  description text not null default '',
  agency      text not null default '',       -- e.g. TAJ, COJ, NIS
  documents   jsonb not null default '[]',    -- required documents for this step
  est_cost_jmd numeric(12,2),
  est_days    int,
  depends_on  int references public.checklist_items (id)
);

alter table public.checklist_items enable row level security;
create policy "checklist config: read" on public.checklist_items for select to authenticated using (true);

-- Vetted partner institutions for referrals (FR-BIZ-8).
create table public.partners (
  id          serial primary key,
  country     text not null default 'JM',
  name        text not null,
  category    text not null check (category in ('banking', 'credit_union', 'training', 'government', 'insurance')),
  description text not null default '',
  url         text,
  parish      text
);

alter table public.partners enable row level security;
create policy "partners: read" on public.partners for select to authenticated using (true);

-- The worker's position on the journey (FR-BIZ-2).
create table public.formalization_progress (
  user_id         uuid primary key references public.worker_profiles (user_id) on delete cascade,
  status          text not null default 'not_started'
                    check (status in ('not_started', 'suggested', 'active', 'completed')),
  suggested_at    timestamptz,
  activated_at    timestamptz,
  completed_at    timestamptz,
  activation_mode text check (activation_mode in ('auto_suggested', 'manual')),
  readiness_score int,
  answers         jsonb not null default '{}',
  updated_at      timestamptz not null default now()
);

create trigger formalization_progress_updated_at
  before update on public.formalization_progress
  for each row execute function public.set_updated_at();

alter table public.formalization_progress enable row level security;

create policy "formalization: own"
  on public.formalization_progress for select
  to authenticated
  using (user_id = auth.uid() or public.is_admin());

create policy "formalization: own insert"
  on public.formalization_progress for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "formalization: own update"
  on public.formalization_progress for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Per-step completion.
create table public.checklist_progress (
  user_id      uuid not null references public.worker_profiles (user_id) on delete cascade,
  item_id      int not null references public.checklist_items (id) on delete cascade,
  done         boolean not null default false,
  done_at      timestamptz,
  note         text not null default '',
  primary key (user_id, item_id)
);

alter table public.checklist_progress enable row level security;

create policy "checklist_progress: own"
  on public.checklist_progress for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Resolve the tailored checklist for a worker (FR-BIZ-3): country-wide steps
-- plus trade- and parish-specific ones, deduped, in step order. Deterministic.
create or replace function public.get_worker_checklist(p_user uuid)
returns table (
  id int, step_order int, title text, description text, agency text,
  documents jsonb, est_cost_jmd numeric, est_days int, done boolean, done_at timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select ci.id, ci.step_order, ci.title, ci.description, ci.agency,
         ci.documents, ci.est_cost_jmd, ci.est_days,
         coalesce(cp.done, false), cp.done_at
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

-- Deterministic readiness scoring (FR-BIZ-1): sum of selected option points.
create or replace function public.submit_questionnaire(p_answers jsonb)
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_score int := 0;
  v_item  record;
  v_pick  text;
begin
  for v_item in select id, options from public.questionnaire_items where country = 'JM' loop
    v_pick := p_answers ->> v_item.id::text;
    if v_pick is not null then
      v_score := v_score + coalesce((
        select (opt ->> 'points')::int
          from jsonb_array_elements(v_item.options) opt
         where opt ->> 'label' = v_pick limit 1), 0);
    end if;
  end loop;

  insert into public.formalization_progress (user_id, readiness_score, answers, updated_at)
  values (auth.uid(), v_score, p_answers, now())
  on conflict (user_id) do update
    set readiness_score = excluded.readiness_score,
        answers = excluded.answers,
        updated_at = now();

  return v_score;
end;
$$;

-- Manual activation, always available (FR-BIZ-7).
create or replace function public.activate_formalization()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.formalization_progress (user_id, status, activated_at, activation_mode)
  values (auth.uid(), 'active', now(), 'manual')
  on conflict (user_id) do update
    set status = 'active',
        activated_at = coalesce(public.formalization_progress.activated_at, now()),
        activation_mode = coalesce(public.formalization_progress.activation_mode, 'manual');
end;
$$;

-- Auto-suggest (FR-BIZ-6): pure business logic on reputation metrics.
-- Suggestion-with-confirm — creates a notification card; NEVER silently enrolls.
create or replace function public.check_formalization_eligibility(p_worker uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  cfg          jsonb;
  v_min_jobs   int;
  v_min_rating numeric;
  v_min_weeks  int;
  v_active_weeks int;
  v_wp         record;
  v_current    text;
begin
  select value into cfg from public.app_config where key = 'formalization_suggest';
  v_min_jobs   := coalesce((cfg ->> 'min_completed_jobs')::int, 10);
  v_min_rating := coalesce((cfg ->> 'min_avg_rating')::numeric, 4.5);
  v_min_weeks  := coalesce((cfg ->> 'min_active_weeks')::int, 4);

  select jobs_completed, rating_avg into v_wp
    from public.worker_profiles where user_id = p_worker;
  if not found then return false; end if;

  -- Consistent activity: distinct weeks with completed jobs in the last 12 weeks.
  select count(distinct date_trunc('week', completed_at)) into v_active_weeks
    from public.jobs
   where worker_id = p_worker and status = 'completed'
     and completed_at > now() - interval '12 weeks';

  if v_wp.jobs_completed < v_min_jobs
     or v_wp.rating_avg < v_min_rating
     or v_active_weeks < v_min_weeks then
    return false;
  end if;

  select status into v_current from public.formalization_progress where user_id = p_worker;
  if v_current in ('suggested', 'active', 'completed') then
    return true; -- already on the journey; don't re-suggest
  end if;

  insert into public.formalization_progress (user_id, status, suggested_at, activation_mode)
  values (p_worker, 'suggested', now(), 'auto_suggested')
  on conflict (user_id) do update
    set status = 'suggested', suggested_at = now(), activation_mode = 'auto_suggested';

  insert into public.notifications (user_id, type, title, body, data)
  values (p_worker, 'formalization_suggestion',
          'Ready to make it official?',
          'Your track record qualifies you to start formalizing your business. Tap to see your personalized pathway — it''s your choice.',
          jsonb_build_object('screen', 'formalize'));

  return true;
end;
$$;

-- Evaluate eligibility whenever reputation recomputes.
create or replace function public.on_reputation_check_formalization()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.check_formalization_eligibility(new.worker_id);
  return new;
end;
$$;

create trigger reputation_check_formalization
  after insert or update on public.reputation_scores
  for each row execute function public.on_reputation_check_formalization();

-- Completing the pathway unlocks the business tier (FR-VER-6).
create or replace function public.on_formalization_complete()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.status = 'completed' and old.status is distinct from 'completed' then
    new.completed_at = coalesce(new.completed_at, now());
    update public.worker_profiles set tier_business = true where user_id = new.user_id;
  end if;
  return new;
end;
$$;

create trigger formalization_complete_tier
  before update on public.formalization_progress
  for each row execute function public.on_formalization_complete();
