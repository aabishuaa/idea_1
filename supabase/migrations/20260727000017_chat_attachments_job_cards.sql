-- MyB · 0017 — richer chat: attachments and shared job cards
--
-- Chat could only carry plain text, which is not how this work gets agreed.
-- People send a photo of the broken pipe, and they need the job they are
-- talking about to be one tap away.
--
-- Two additions, both on the existing messages table so history and realtime
-- keep working unchanged:
--   · kind + attachment columns for images
--   · job_id so a message can BE a job card, tappable through to the booking

alter table public.messages
  add column if not exists kind text not null default 'text'
    check (kind in ('text', 'image', 'job_card')),
  add column if not exists attachment_path text,
  add column if not exists attachment_mime text,
  add column if not exists job_id uuid references public.jobs (id) on delete set null;

-- A job card must reference a job; an image must reference a file.
alter table public.messages drop constraint if exists messages_kind_payload_check;
alter table public.messages add constraint messages_kind_payload_check check (
  (kind = 'text')
  or (kind = 'image' and attachment_path is not null)
  or (kind = 'job_card' and job_id is not null)
);

-- ── Chat attachment storage ────────────────────────────────────────────────
-- Private bucket: only the two people in the thread can read an attachment.
insert into storage.buckets (id, name, public)
values ('chat-attachments', 'chat-attachments', false)
on conflict (id) do nothing;

-- Files are stored under <thread_id>/<uuid>, so access is decided by thread
-- membership rather than by who uploaded the file.
drop policy if exists "chat attachments: participants read" on storage.objects;
create policy "chat attachments: participants read"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'chat-attachments'
    and exists (
      select 1 from public.threads t
       where t.id::text = (storage.foldername(name))[1]
         and (t.customer_id = auth.uid() or t.worker_id = auth.uid())
    )
  );

drop policy if exists "chat attachments: participants upload" on storage.objects;
create policy "chat attachments: participants upload"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'chat-attachments'
    and exists (
      select 1 from public.threads t
       where t.id::text = (storage.foldername(name))[1]
         and (t.customer_id = auth.uid() or t.worker_id = auth.uid())
    )
  );
