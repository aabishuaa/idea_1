# supabase/ — data backbone

Postgres (+ PostGIS + pgvector), Auth, Storage, Realtime, Edge Functions, RLS.
This surface **owns all business data and most logic** (CLAUDE.md §2).

## Layout

| Path | What |
| --- | --- |
| `migrations/0001…0011` | Schema in dependency order: extensions → profiles → worker profiles/storage → jobs/reviews → reputation+fraud → verification → messaging → formalization → KB → matching/analytics → JM reference data |
| `functions/extract-intent` | NL job description → `{job_type, location, urgency, budget}` + query embedding (Gemini→Groq failover) |
| `functions/embed-text` | Embeds a worker's service description into pgvector (owner-checked) |
| `functions/keepwarm` | Ping target for the GitHub Actions anti-pause cron |
| `seed.sql` | Local demo data (`supabase db reset` only) |
| `seed_hosted_helpers.sql` | Hosted-project demo promotion script (SQL editor) |

## Where the logic lives (quick index)

| Concern | Object |
| --- | --- |
| Matching (weighted, deterministic) | `match_workers()` — migration 0010 |
| Reputation (computed, portable) | `compute_reputation()` + triggers — 0005 |
| Fraud heuristics | `run_fraud_checks()` — 0005 |
| Verification finalize (both gates) | `finalize_identity_verification()` — 0006 |
| Formalization checklist resolve | `get_worker_checklist()` — 0008 |
| Readiness questionnaire scoring | `submit_questionnaire()` — 0008 |
| Auto-suggest (confirm-first) | `check_formalization_eligibility()` — 0008 |
| RAG retrieval | `match_kb_chunks()` — 0009 |
| Demand insights | `get_demand_insights()` — 0010 |

## Rules that must hold

- **Every table has explicit RLS** (SR-12). New table ⇒ new policies in the same migration.
- Trust-bearing columns (verified flags, tiers, reputation, embeddings) are writable
  only server-side — enforced with column-level grants, not conventions.
- Deterministic logic stays in SQL/config tables; the LLM never decides scores,
  checklists, or thresholds (SR-23).
- Tunable thresholds live in `app_config`, not code.
