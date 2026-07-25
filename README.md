# myB — Mind Yuh Business

**All you need. One place.**

MyB is a mobile-first platform that turns Jamaica's invisible informal skilled labour into
visible economic participation: trusted labour discovery, portable professional reputation,
and a progressive pathway toward business formalization — in one app.

Built by **Team Bit-by-Bit** for the CANTO Innovation Challenge 2026 (Phase 2).

## What's in the box

| Directory | Surface | Stack |
| --- | --- | --- |
| [`app/`](app) | Mobile app (all UI, on-device liveness) | React Native + Expo Router, TypeScript strict |
| [`supabase/`](supabase) | Data backbone (owns business data + logic) | Postgres + PostGIS + pgvector, Auth, Storage, Realtime, RLS, Edge Functions |
| [`ai-service/`](ai-service) | Face embedding/match + RAG orchestration | Python 3.11, FastAPI, Pydantic |
| [`docs/`](docs) | Architecture notes + BizBot knowledge base sources | Markdown |

Three deployment surfaces, no more. Everything runs on free tiers.

## Core features (MVP, Jamaica only)

- **Discovery & matching** — describe a job in plain language; an LLM extracts structured
  intent, then a *deterministic* weighted SQL score (semantic skill relevance via pgvector,
  PostGIS proximity, reputation, availability, completion history) ranks workers.
- **Reputation** — a computed, portable, worker-owned score (Postgres function, not AI),
  recalculated on job completion and reviews, plus heuristic fraud checks.
- **Two-gate identity verification** — active on-device liveness (ML Kit head-turn + blink)
  and server-side face match (cosine similarity vs the ID embedding). Progressive tiers:
  identity → phone → skill → business.
- **BizBot + formalization pathway** — deterministic readiness questionnaire, progress
  dashboard, and trade/parish document checklist from config tables; RAG-grounded Q&A
  over a country/parish-tagged knowledge base with citations.
- **Jobs, chat & notifications** — full job lifecycle with reviews, Supabase Realtime
  messaging, Expo push notifications.

## Quick start

Full instructions (with every placeholder you need to fill in): **[SETUP.md](SETUP.md)**.

```bash
# 1. Supabase: create a free project, then
supabase link --project-ref YOUR-PROJECT-REF
supabase db push
supabase functions deploy extract-intent embed-text keepwarm

# 2. AI service
cd ai-service && cp .env.example .env   # fill in keys
pip install -r requirements.txt && uvicorn main:app --reload

# 3. App
cd app && cp .env.example .env          # fill in Supabase URL + anon key
npm install && npm start                # Expo Go
```

## Engineering ground rules

See [CLAUDE.md](CLAUDE.md) for the full guidance. The short version:

- RLS-first security; the service-role key never ships in the client.
- LLMs are for language, never for decisions — scoring, checklists, and thresholds are
  deterministic SQL/config.
- Gemini 2.5 Flash primary → Groq failover on every LLM call.
- Free tier is a hard constraint; the paid upgrade path is config, not a rewrite.

## Team

- **Abishua Johnson** — backend/AI (RAG + face match, matching/reputation, fraud heuristics)
- **Joel Dixon** — systems/DB (schema, RLS, PostGIS/pgvector, scalability)
- **Emani Longmore** — product/frontend (Expo app, UX, onboarding, liveness UI, accessibility)
