-- MyB · 0013 — profile read visibility
--
-- 0002 shipped with a single SELECT policy on profiles ("read own"), which
-- meant every screen showing somebody ELSE's name got null back:
--   · a pro's profile page crashed (no profile row for the worker)
--   · the messages inbox and chat header showed blank names
--   · review author names came back empty
--
-- Discovery data (name, avatar, parish, verified flag) is already public
-- through match_workers, so these policies just make direct reads agree with
-- what the matching function already exposes. SELECT policies are OR'd, so
-- "read own" still covers your own row.

-- 1. Anyone signed in can read the profile of a worker who is discoverable.
create policy "profiles: read visible workers"
  on public.profiles for select
  to authenticated
  using (
    exists (
      select 1 from public.worker_profiles wp
       where wp.user_id = profiles.id
         and wp.visible = true
    )
  );

-- 2. The two sides of a job or chat can read each other (customer ↔ worker).
--    The subqueries run under the caller's own RLS on jobs/threads, so this
--    only ever matches a counterparty of the current user.
create policy "profiles: read counterparties"
  on public.profiles for select
  to authenticated
  using (
    exists (
      select 1 from public.jobs j
       where (j.customer_id = auth.uid() and j.worker_id = profiles.id)
          or (j.worker_id = auth.uid() and j.customer_id = profiles.id)
    )
    or exists (
      select 1 from public.threads t
       where (t.customer_id = auth.uid() and t.worker_id = profiles.id)
          or (t.worker_id = auth.uid() and t.customer_id = profiles.id)
    )
  );

-- 3. Review authors are attributed publicly on the pro profiles they review,
--    so their name must be readable for the review list to render.
create policy "profiles: read review authors"
  on public.profiles for select
  to authenticated
  using (
    exists (select 1 from public.reviews r where r.reviewer_id = profiles.id)
  );
