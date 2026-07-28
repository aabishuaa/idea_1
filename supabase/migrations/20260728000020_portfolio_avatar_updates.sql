-- MyB · 0020 — let a worker replace a file they already own
--
-- 0003 gave the `portfolios` bucket public read plus owner insert and owner
-- delete. That covers adding and removing work photos, and it is enough right
-- up until someone changes their profile picture a second time.
--
-- Avatars are stored at a stable path (<uid>/avatar.<ext>) so old ones do not
-- accumulate in a 1 GB free tier, which means the second upload is an upsert.
-- Supabase Storage implements upsert as an UPDATE on storage.objects, and
-- there was no UPDATE policy — so the first avatar worked and every change
-- after it failed.
--
-- Scoped identically to the existing write policy: the first path segment is
-- the owner's uid, so the folder is the permission check.
drop policy if exists "storage portfolios: owner update" on storage.objects;
create policy "storage portfolios: owner update"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'portfolios'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'portfolios'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
