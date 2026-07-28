-- MyB · 0019 — stream job rows over Realtime
--
-- The demo is two phones: a customer sends a request on one, and it has to
-- appear on the worker's device without either of them pulling to refresh —
-- then the customer has to see the moment the worker accepts.
--
-- `notifications` was already published (0007), but a notification row is a
-- headline, not the job. Publishing `jobs` lets both sides subscribe to the
-- row they already have permission to read: RLS still applies, so a
-- subscription only ever delivers jobs where the listener is the customer or
-- the worker ("jobs: participants read", 0004).
--
-- Guarded twice over: a publication membership cannot be added twice (so this
-- stays re-runnable against an already-pushed project), and `supabase_realtime`
-- is created by the Supabase platform rather than by these migrations, so a
-- bare Postgres used for schema testing simply skips this.
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    raise notice 'supabase_realtime publication absent — skipping jobs realtime';
    return;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'jobs'
  ) then
    alter publication supabase_realtime add table public.jobs;
  end if;
end;
$$;

-- Realtime sends the OLD row on updates/deletes only for the columns in the
-- replica identity. Default (primary key) is enough here: the app re-reads the
-- job through PostgREST when it is told the row changed, so it never trusts
-- the payload for anything but "something moved".
