# BizBot knowledge base sources

Country/parish-tagged markdown documents that power BizBot's RAG Q&A
(FR-BIZ-5). Retrieval is filtered by the `country` tag, so expanding to
another CARICOM country means adding tagged documents — no code changes (SR-9).

## ⚠️ Content status: DEVELOPMENT PLACEHOLDERS

The text below each front matter is written for development and demo
structure. **Before any public demo or launch, replace it with text sourced
from the official publications and fill in every `source_url`.** BizBot cites
these documents to users — the citations are only as trustworthy as what you
put here. Amounts (fees, thresholds) change; always verify against:

- Tax Administration Jamaica — https://www.jamaicatax.gov.jm
- Companies Office of Jamaica — https://www.orcjamaica.com
- National Insurance Scheme (Ministry of Labour) — https://mlss.gov.jm

## Format

```markdown
---
slug: unique-doc-slug
title: Human title
country: JM
parish:            # empty = country-wide; set for parish-specific content
topic: tax | registration | insurance | general
source_name: e.g. Tax Administration Jamaica
source_url: https://…   ← REPLACE_ME — required before demo
---

Body text. Paragraphs are chunked (~900 chars) and embedded individually,
so keep each paragraph self-contained.
```

## Ingest

```bash
cd ai-service && source .venv/bin/activate
python scripts/ingest_kb.py ../docs/kb   # re-run after every edit
```

Admins can also manage documents directly in the `kb_documents` / `kb_chunks`
tables (FR-ADM-1); ingest overwrites chunks per document slug.
