# MyB architecture notes

Companion to [CLAUDE.md](../CLAUDE.md) (ground rules) and
[MyB_Requirements_Specification](https://github.com/aabishuaa/idea_1) (scope).
This file maps requirements → code so you can find where anything lives.

## The three surfaces

```
┌──────────────────────┐        anon key + RLS         ┌──────────────────────────┐
│  Expo app (RN/TS)    │──────────────────────────────▶│  Supabase                │
│  all UI              │   auth · data · realtime      │  Postgres + PostGIS      │
│  on-device liveness  │   storage · edge functions    │  + pgvector · RLS        │
└─────────┬────────────┘                               │  SQL functions (logic)   │
          │ user JWT                                   └────────────▲─────────────┘
          ▼                                                         │ service-role key
┌──────────────────────┐            RAG retrieval (RPC) + writes    │
│  AI service (FastAPI)│────────────────────────────────────────────┘
│  face embed + match  │      LLMs: Gemini 2.5 Flash → Groq failover
│  RAG orchestration   │      Embeddings: text-embedding-004 (768d)
└──────────────────────┘
```

- The app never holds the service-role key or LLM keys (SR-13).
- Edge functions (`extract-intent`, `embed-text`) hold LLM keys for
  language-only tasks; the AI service holds them for RAG generation.
- The AI service authenticates callers by verifying their Supabase JWT.

## Decision boundaries (the ones that matter)

| Decision | Mechanism | Where |
| --- | --- | --- |
| Who ranks workers | Deterministic weighted SQL | `match_workers()` — migration 0010 |
| Who computes reputation | Postgres function | `compute_reputation()` — 0005 |
| What the checklist contains | Config tables | `checklist_items` + `get_worker_checklist()` — 0008 |
| Questionnaire scoring | SQL over config points | `submit_questionnaire()` — 0008 |
| When to suggest formalizing | Threshold logic (app_config) | `check_formalization_eligibility()` — 0008 |
| What BizBot may say | RAG over tagged KB, cited | `ai-service /rag/query` + `match_kb_chunks()` — 0009 |
| What the LLM does | Language ONLY: intent extraction, RAG phrasing | edge `extract-intent`, AI service RAG |

## Verification pipeline (two gates, four steps)

1. **Consent** (app → `verification_records`): explicit, versioned, before any capture.
2. **Gate 1 — ID embedding** (app → AI `/face/embed-id`): face detected/cropped from
   the ID; 512-d ArcFace embedding stored server-side; raw image pointer dropped
   after successful match.
3. **Gate 2 — liveness** (on-device only): ML Kit Euler-Y swing left/right + blink
   via eye-open probability (`src/features/liveness/LivenessCamera.tsx`). A printed
   photo fails here. Never a server round-trip (SR-5).
4. **Gate 4 — face match** (app → AI `/face/match`): selfie embedding vs ID embedding,
   cosine ≥ threshold → `finalize_identity_verification()` grants verified only if
   liveness ALSO passed (FR-VER-5).

Tiers: identity (above) → phone (`refresh_phone_verification()`) → skill
(≥5 jobs at ≥4.0★, recomputed with reputation) → business (checklist complete).

## Matching flow

```
"mi sink a leak"
  → edge extract-intent  (LLM: {job_type, location, urgency, budget} + query embedding)
  → rpc match_workers    (SQL: 0.35 semantic + 0.25 proximity + 0.20 reputation
                               + 0.10 availability + 0.10 history)
  → ranked list with distance, similarity, verification badges
```

LLM unavailable? The app degrades to trade/parish filter search — matching never
depends on the LLM being up.

## Reputation & fraud

Reviews/job completions/disputes fire triggers → `compute_reputation()` (blend with
smoothing priors, breakdown stored in `reputation_scores.components`) →
`run_fraud_checks()` (velocity, device overlap, rating pattern → `fraud_flags`,
admin-only) → tier refresh → formalization eligibility check. All one SQL chain,
no app code involved.

## Free-tier survival

- GitHub Actions cron pings `keepwarm` twice weekly (Supabase 7-day pause).
- Every LLM call: Gemini → Groq failover with 429/timeout handling; both-down is
  a retryable 503 the app surfaces as a progress/degraded state.
- AI service cold starts are expected: 90s client timeouts + "waking up" copy.

## Deferred (ROADMAP — do not build in MVP)

ML ranking/fraud, social login, TRN registry verification, direct government
filing (TAJ/COJ), in-app payments (WiPay/Lynk), partner analytics dashboards,
multi-country data. Map integration (MapLibre/OSM) is wired conceptually via
PostGIS distances; a visual map screen is a post-MVP add.
