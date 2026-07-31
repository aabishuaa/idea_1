# CLAUDE.md — MyB (Mind Yuh Business)

Guidance for Claude Code when working in this repository. Read this fully before
scaffolding, coding, or answering architecture questions.

## 1. What we're building

MyB (Mind Yuh Business) is a mobile-first platform that turns Jamaica's invisible informal
skilled labour into visible economic participation. It combines three things into one app:
trusted labour discovery, portable professional reputation, and a progressive pathway
toward business formalization.

- **Team:** Bit-by-Bit (Abishua Johnson — backend/AI lead; Joel Dixon — systems/DB
  architecture; Emani Longmore — product/frontend)
- **Context:** CANTO Innovation Challenge 2026, Phase 2. Deliverable is a working
  MVP/prototype + written doc + live pitch.
- **Track:** Smart Businesses, Tourism & Economic Growth (secondary: Education, Skills
  & Workforce Development).

### MVP scope — Jamaica only

Ship a complete, demoable, defensible slice. In scope: rules-based matching + semantic
search, computed reputation, heuristic fraud checks, RAG-backed BizBot over Jamaican
formalization docs, and tiered identity verification. Everything must run on free tiers for
both development and deployment.

**Explicitly deferred (roadmap, do not build now):** ML-based matching, ML fraud
detection, live government/TAJ/COJ integrations, in-app payments, and any multi-country
/ other-CARICOM data. When a task drifts toward these, flag it as out of MVP scope rather
than implementing it.

## 2. Architecture (three deployment surfaces)

Keep the system to exactly three surfaces. Do not introduce additional microservices.

| Surface | Responsibility |
| --- | --- |
| Expo app (React Native) | All UI. On-device liveness challenge. Talks to Supabase directly and to the AI service for face-match + RAG. |
| Supabase | Postgres (+ PostGIS + pgvector), Auth, Storage, Realtime, Edge Functions, Row Level Security. Owns all business data and most logic. |
| AI service (Python / FastAPI) | Face embedding + cosine match. Optional semantic RAG retrieval. The only Python surface. |

**BizBot RAG runs in a Supabase edge function** (`functions/bizbot`), not the Python
service. Retrieval is Postgres full-text over `kb_chunks` (`search_kb`), generation is
Gemini→Groq. This was a deliberate change: routing BizBot through Python meant it was
dead whenever that service was not deployed, and the free-tier cold start made it
unusable for a demo. The Python service remains an optional fallback that adds pgvector
semantic retrieval when it is running.

**Rule:** business/data logic defaults to Supabase (SQL functions, RLS, edge functions).
Python-native work (face embeddings, RAG) lives in the FastAPI service. Don't put
deterministic business rules in the AI service, and don't try to do face embedding in edge
functions.

## 3. Tech stack (all free-tier)

- **Frontend:** React Native + Expo (Expo Router, `expo-dev-client`). TypeScript, strict mode.
  - Native modules (camera/liveness) require a custom dev build, not Expo Go.
    Build the dev client early.
- **Backend backbone:** Supabase
  - Postgres with `postgis` (geo proximity) and `pgvector` (embeddings) extensions
  - Auth (email + phone OTP), Storage (ID images, portfolios), Realtime
    (chat/notifications), Edge Functions (Deno/TS glue)
  - Security is RLS-first — every table has explicit policies; never rely on client-side checks.
- **AI service:** Python 3.11+, FastAPI, Pydantic. Deploy free on Render / Hugging Face
  Spaces / Google Cloud Run. Face libs: InsightFace/ArcFace or `face_recognition`.
- **LLM:** Gemini 2.5 Flash (primary, free tier ~1,500 req/day). Groq (Llama) as failover.
  Both OpenAI-compatible — implement primary→secondary failover and handle 429s gracefully.
- **Embeddings:** Gemini embeddings or `gte-small`; stored in pgvector.
- **On-device liveness:** Google ML Kit face detection via `react-native-vision-camera`
  frame processors.
- **Maps:** MapLibre + OpenStreetMap tiles (guaranteed $0). **Push:** Expo Push Notifications.

### Free-tier constraints to respect

- Supabase Free: 500 MB DB, 1 GB storage, 5 GB egress, 50k MAU, auto-pauses after 7
  days idle → a GitHub Actions cron must ping the project to keep it warm.
- Expo Free: 15 Android + 15 iOS EAS builds/month (local builds unlimited). 45-min build timeout.
- Free Python hosts cold-start when idle — acceptable for demo; warm before the pitch.
- Never architect anything that requires a paid tier. The paid upgrade path (Supabase
  Pro $25, Gemini pay-as-you-go, Expo Starter) must be a config change, not a rewrite.

## 4. The three subsystems

### 4.1 AI Matching & Recommendation

- Customer describes a job in plain language → LLM extracts `{job_type, location, urgency, budget}` as structured JSON.
- MVP is rules-based, not ML: a weighted score across skill relevance, geo proximity
  (PostGIS `ST_Distance`), reputation score, availability, and job-completion history.
- Search must work with NO embeddings and NO LLM key. `match_workers(p_query => …)`
  does Postgres full-text + trigram + per-trade synonym matching, so "tutor",
  "someone to braid my hair" and "mi sink a leak under di counter" all resolve.
  Never make discovery depend on an external service.
- Semantic skill matching: embed service descriptions in pgvector so "my sink is
  leaking" matches a plumber without exact keywords. This layers on top of the text
  search as an enhancement — a differentiator, but never the only path.
- The service taxonomy is the whole informal economy, not the building trades:
  tutors, hairdressers, cooks, seamstresses, caregivers, phone repair, drivers.
  Trades carry a `category` and colloquial `synonyms` (migration 0014).
- Do NOT introduce ML ranking models in the MVP.

### 4.2 Reputation Intelligence & Trust

- Reputation score is a computed Postgres function, not AI. Recalculates on job
  completion / new review, blending review average, completion rate, response-time
  consistency, and dispute history. Stored on the worker profile.
- **A job counts only when BOTH sides confirm it** (migration 0024). Clients cannot
  write `jobs.status` at all — `confirm_job_completion` is the only route to
  `completed`, and it requires a signature from the customer and the worker.
  Single-sided completion is self-attestation, which is exactly what makes a
  reputation record worthless to a lender.
- **Money is recorded, never moved.** Both sides state what was paid; the amount is
  only treated as agreed when the two figures match, and unagreed amounts are never
  summed into earnings or onto the reputation record. Never reintroduce a fallback
  that treats a budget or a one-sided figure as income.
- Score is portable and belongs to the worker — frame it as alternative credit data.
- Fraud detection is heuristic for MVP: review-velocity checks, duplicate
  device/account signals, rating-pattern anomalies. ML fraud is roadmap.

### 4.3 BizBot + Progressive Formalization

Critical boundary — two different mechanisms, do not merge them:

- **Conversational Q&A** ("What is GCT?", "Do I need a TRN?") → RAG. Chunks are
  tagged with country/parish metadata so the knowledge base is swappable per
  country; retrieval is filtered by country. Always ground answers in the source docs and
  cite them. Never let BizBot invent tax/registration rules.
- **Structured pathway** (readiness questionnaire, progress dashboard, document
  checklist by trade+parish, step sequencing) → deterministic logic / config tables,
  NOT RAG. These must be reliable and repeatable. BizBot reads from structured config
  and narrates it; RAG only handles the open-ended questions asked along the way.
  Never route a checklist or a required-documents lookup through RAG.
- **Auto-trigger:** pure business logic on reputation metrics (e.g. completed-jobs ≥
  threshold AND rating ≥ threshold AND consistent activity) surfaces a suggestion
  card. Always suggestion-with-confirm — the worker taps to opt in. Never silent
  enrollment. Manual activation is always available from a menu.

## 5. Identity verification pipeline

Two separate gates — keep them distinct in code and UI. Cosine similarity only does
matching, not liveness.

1. **ID upload** → detect + crop the face from the government ID → compute and store its embedding.
2. **Active liveness (on-device)** → guided challenge: turn head left, turn right, blink.
   Verify via ML Kit head Euler-Y angle swing and eye-open probability across frames.
   This proves a live human. A printed photo must fail here.
3. **Frontal capture** at the end of the challenge → send one clean frame to the AI service.
4. **Face match (server)** → embed the selfie → cosine similarity vs the stored ID
   embedding → threshold → pass/fail → unlock the verified tier.

- **Tiers:** identity verification gates access; workers progress through additional tiers
  (phone, skill, business) that unlock visibility.
- **Threshold:** cosine cutoffs are model-specific — hardcode a sensible value for the
  demo and note calibration (false-accept/reject) as a refinement. Do not present a
  threshold as a universal magic number.
- **Privacy (Jamaica Data Protection Act):** face embeddings and ID images are sensitive
  personal data. Prefer storing embeddings over raw images. Require an explicit
  consent step before capture. Design for DPA compliance now; verify current DPA
  requirements before writing the privacy section.

## 6. Coding conventions

- TypeScript everywhere in the app; strict mode; no `any` without a comment justifying it.
- Python: type hints + Pydantic models on every FastAPI boundary.
- Secrets via environment variables only. Never commit keys (Supabase service key,
  LLM keys). Provide `.env.example`.
- Supabase access: app uses the anon key + RLS. The service-role key lives only in the
  AI service / edge functions, never in the client bundle.
- LLM calls: always wrap with failover (Gemini → Groq) and explicit 429/timeout
  handling. Never block the UI on a cold-starting AI service — show progress state.
- Determinism: never call an LLM for logic that must be reliable (checklists, scoring,
  matching weights, thresholds). LLMs are for language, not decisions.
- Keep verification's two gates separate — a change to matching must not touch
  liveness and vice versa.
- Prefer SQL functions + RLS for data logic over app-side logic.
- Small, reviewable commits. Conventional Commit prefixes (`feat:`, `fix:`, `chore:`).

### Ownership (informal)

- Abishua → AI service (RAG + face match), matching/reputation scoring functions, fraud heuristics.
- Joel → Supabase schema, RLS policies, PostGIS/pgvector setup, API structure, scalability.
- Emani → Expo app, UX, onboarding, liveness UI, accessibility for low-digital-literacy users.

## 7. Repo layout

```
/app            # Expo React Native application (TypeScript)
/ai-service     # FastAPI: face embedding/match + RAG orchestration
/supabase       # migrations, RLS policies, edge functions, seed data
/docs           # architecture notes, formalization knowledge base sources
.env.example
CLAUDE.md
SETUP.md
```

## 8. Commands

```bash
# app
cd app && npm install
cd app && npm start                       # dev via Expo Go (expo start --go) — no camera/liveness
cd app && npx expo run:android            # custom dev build (full features)
cd app && npm run typecheck               # tsc --noEmit
cd app && npm run lint

# ai-service
cd ai-service && python -m venv .venv && source .venv/bin/activate
cd ai-service && pip install -r requirements.txt
cd ai-service && uvicorn main:app --reload
cd ai-service && pytest

# supabase (local stack needs Docker; or use hosted project)
supabase start                            # local stack
supabase db push                          # apply migrations to linked project
supabase db reset                         # local: re-run migrations + seed
supabase functions serve                  # run edge functions locally
supabase functions deploy extract-intent embed-text keepwarm bizbot
```

## 9. When unsure

- If a request implies a deferred feature (payments, gov integration, ML models, other
  countries), say so and propose the MVP-appropriate version instead.
- If a change would require leaving a free tier, stop and flag it.
- If asked to put deterministic logic into RAG or the LLM, push back and use structured logic.
- Tie technical choices back to the judging rubric where relevant: Technical Feasibility,
  Prototype & Functionality, User-Centered Design, Impact & Regional Relevance,
  Scalability & Sustainability, Pitch Delivery.
