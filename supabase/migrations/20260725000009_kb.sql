-- MyB · 0009 — BizBot knowledge base (RAG retrieval side)
-- FR-BIZ-5, FR-ADM-1. Chunks are country/parish-tagged so the KB is swappable
-- per country (SR-9): retrieval is ALWAYS filtered by country. Answers must be
-- grounded in these chunks and cited — BizBot never invents tax/registration rules.

create table public.kb_documents (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  title       text not null,
  country     text not null default 'JM',
  parish      text,                    -- null = country-wide
  topic       text not null default 'general',
  source_name text not null default '',
  source_url  text not null default '',
  updated_at  timestamptz not null default now()
);

create table public.kb_chunks (
  id          uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.kb_documents (id) on delete cascade,
  chunk_index int not null,
  content     text not null,
  country     text not null default 'JM',
  parish      text,
  topic       text not null default 'general',
  embedding   vector(768),
  unique (document_id, chunk_index)
);

create index kb_chunks_country_idx on public.kb_chunks (country);
create index kb_chunks_embedding_idx on public.kb_chunks
  using ivfflat (embedding vector_cosine_ops) with (lists = 100);

alter table public.kb_documents enable row level security;
alter table public.kb_chunks enable row level security;

create policy "kb_documents: read"
  on public.kb_documents for select to authenticated using (true);

create policy "kb_chunks: read"
  on public.kb_chunks for select to authenticated using (true);

-- Admin KB management (FR-ADM-1); ingestion itself runs with the service role
-- (ai-service/scripts/ingest_kb.py), these policies cover dashboard edits.
create policy "kb_documents: admin write"
  on public.kb_documents for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "kb_chunks: admin write"
  on public.kb_chunks for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Retrieval for RAG: cosine similarity, country-filtered, optional parish boost.
create or replace function public.match_kb_chunks(
  p_embedding vector(768),
  p_country   text default 'JM',
  p_parish    text default null,
  p_limit     int default 6
)
returns table (
  chunk_id    uuid,
  content     text,
  topic       text,
  similarity  numeric,
  doc_title   text,
  source_name text,
  source_url  text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select c.id,
         c.content,
         c.topic,
         round((1 - (c.embedding <=> p_embedding))::numeric, 4) as similarity,
         d.title,
         d.source_name,
         d.source_url
    from public.kb_chunks c
    join public.kb_documents d on d.id = c.document_id
   where c.country = p_country
     and c.embedding is not null
     and (c.parish is null or p_parish is null or c.parish = p_parish)
   order by c.embedding <=> p_embedding
   limit p_limit;
$$;
