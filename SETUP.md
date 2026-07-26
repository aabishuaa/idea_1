# MyB — Setup Guide

This walks you from a fresh clone to a running stack: Supabase (data + auth + edge
functions), the FastAPI AI service (face match + RAG), and the Expo app.

Everything runs on **free tiers**. Wherever you must supply your own value, it is marked
**`REPLACE_ME`** in the example env files — §7 has a checklist of every placeholder.

---

## 0. Prerequisites

| Tool | Version | Notes |
| --- | --- | --- |
| Node.js | 20 LTS+ | for the Expo app |
| npm | 10+ | ships with Node |
| Python | 3.11+ | for the AI service |
| Supabase CLI | latest | `npm i -g supabase` or `brew install supabase/tap/supabase` |
| Docker | optional | only needed for `supabase start` (local stack) |
| Android Studio / Xcode | optional | only needed for custom dev builds (liveness camera) |
| EAS CLI | optional | `npm i -g eas-cli` — cloud builds + push notifications |

You also need free accounts at:

- [supabase.com](https://supabase.com) — database, auth, storage, realtime, edge functions
- [aistudio.google.com](https://aistudio.google.com/apikey) — Gemini API key (primary LLM + embeddings)
- [console.groq.com](https://console.groq.com/keys) — Groq API key (LLM failover)
- [expo.dev](https://expo.dev) — optional, for EAS builds and push notifications
- [render.com](https://render.com) (or Hugging Face Spaces / Google Cloud Run) — optional, to deploy the AI service

---

## 1. Supabase project

### 1.1 Create + link

1. Create a project at <https://supabase.com/dashboard> (free tier). Pick a strong DB
   password and save it.
2. Grab your credentials from **Project Settings**:
   - **Data API** → Project URL → `SUPABASE_URL`
   - **API Keys** → `anon` / publishable key → `SUPABASE_ANON_KEY`
   - **API Keys** → `service_role` / secret key → `SUPABASE_SERVICE_ROLE_KEY` (server-side only!)
3. Link the repo to the project:

```bash
supabase login
supabase link --project-ref YOUR-PROJECT-REF   # the subdomain of your project URL
```

### 1.2 Apply the schema

```bash
supabase db push
```

This runs everything in `supabase/migrations/` in order: extensions (PostGIS, pgvector),
all tables **with RLS policies**, the matching/reputation/fraud SQL functions, storage
buckets, and the Jamaican reference data (trades, parishes, formalization checklists,
readiness questionnaire).

> Local alternative (needs Docker): `supabase start` then `supabase db reset` — this also
> loads `supabase/seed.sql` (demo workers/jobs for local development).

### 1.3 Auth providers

In **Authentication → Sign In / Providers**:

- **Email** — enabled by default. For the demo you can disable "Confirm email" to skip
  the confirmation step (Authentication → Sign In / Providers → Email).
- **Phone OTP** — supported by the app, but Supabase needs an SMS provider (Twilio etc.)
  which is not free. **For the MVP demo, use email auth**; the phone tier in the app
  falls back to marking the phone as "pending verification". This is a config change
  later, not a rewrite.

### 1.4 Edge function secrets + deploy

Edge functions hold the LLM keys (never the app):

```bash
supabase secrets set GEMINI_API_KEY=your-gemini-key GROQ_API_KEY=your-groq-key
supabase functions deploy extract-intent embed-text keepwarm --no-verify-jwt
```

> `keepwarm` must be public (no JWT) so the GitHub Action can ping it; `extract-intent`
> and `embed-text` verify the caller's Supabase JWT in-code, so `--no-verify-jwt` is safe
> and keeps local/dev testing simple. If you prefer platform-level JWT verification,
> deploy those two without the flag.

### 1.5 Keep-warm cron (GitHub Actions)

Supabase free projects pause after ~7 days idle. The workflow in
`.github/workflows/keepwarm.yml` pings the project twice a week. In your GitHub repo:

**Settings → Secrets and variables → Actions → New repository secret**:

- `SUPABASE_URL` — your project URL
- `SUPABASE_ANON_KEY` — your anon key

That's it — the schedule is already in the workflow.

---

## 2. AI service (FastAPI)

### 2.1 Run locally

```bash
cd ai-service
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env        # fill in the REPLACE_ME values
uvicorn main:app --reload   # http://localhost:8000/docs
```

`GET /health` should return `{"status":"ok", ...}`.

> **Face library note:** `requirements.txt` uses `insightface` + `onnxruntime` (CPU).
> The first run downloads the ArcFace model (~300 MB). If install is painful on your
> machine, the service degrades gracefully: endpoints return `503 face_engine_unavailable`
> and everything else (RAG, health) still works — see `ai-service/README.md`.

### 2.2 Deploy free (Render)

1. Push this repo to GitHub.
2. On Render: **New → Web Service** → pick the repo → root directory `ai-service`
   (Render reads `ai-service/render.yaml`; or set Build `pip install -r requirements.txt`
   and Start `uvicorn main:app --host 0.0.0.0 --port $PORT` manually).
3. Add the environment variables from `ai-service/.env.example` in the Render dashboard.
4. Note the public URL — that's your `EXPO_PUBLIC_AI_SERVICE_URL`.

Free instances **cold-start** after idling (~50s). The app shows progress states for
this; before a live pitch, hit `/health` once to warm it.

### 2.3 Ingest the BizBot knowledge base

The RAG knowledge base sources live in `docs/kb/*.md` (country/parish-tagged front
matter). Chunk + embed + upload them:

```bash
cd ai-service && source .venv/bin/activate
python scripts/ingest_kb.py ../docs/kb
```

Re-run any time you edit the KB. **Replace the sample KB content with verified,
current Jamaican source material before any public demo** — the samples are structured
placeholders written for development, not legal guidance (each file's front matter has a
`source_url` to fill in).

---

## 3. Expo app

### 3.1 Configure + run (Expo Go — quickest)

```bash
cd app
cp .env.example .env        # fill in the REPLACE_ME values
npm install
npm start                   # expo start --go: scan the QR with Expo Go
```

**Works in Expo Go:** auth, profiles, discovery/matching, jobs, chat, BizBot,
formalization pathway, earnings — the whole app *except* the camera-based liveness
challenge (which needs native ML Kit modules). The verification flow detects this and
shows a "requires dev build" notice with a demo-mode bypass for flow testing.

### 3.2 Custom dev build (full liveness)

```bash
cd app
npx expo run:android        # or: npx expo run:ios   (local build, unlimited & free)
# or cloud builds (free tier: 15/platform/month):
eas init                    # writes your EAS projectId into app.json
eas build --profile development --platform android
```

### 3.3 Push notifications

Expo push needs an EAS project id: run `eas init` once (it fills
`extra.eas.projectId` in `app.json`, replacing the placeholder). Without it the app
still runs; push registration is skipped with a console notice.

---

## 4. Demo data

- **Local stack:** `supabase db reset` loads `supabase/seed.sql` — 12 demo workers
  across 8 trades and 7 parishes, 20 completed jobs with reviews (reputation and
  Top Pro tier computed by the triggers), live bookings in every status, chats with
  unread messages, a formalization journey in two states (suggested + active), and
  verification records. Demo logins (password for all: `myb-demo-123`):

  | Account | Role | What it demos |
  | --- | --- | --- |
  | `andre@demo.myb` | Customer | Rich home: bookings (pending/confirmed/in-progress), unread chats |
  | `brown@demo.myb` | Customer | Second reviewer account |
  | `marcus@demo.myb` | Electrician | Top Pro, 4.8★, formalization auto-suggest card |
  | `sasha@demo.myb` | Plumber | Verified, formalization pathway active (2/8 steps) |
  | `devon@demo.myb` | Carpenter | Unverified — shows the "Verify your identity" flow |

- **Hosted project:** auth users can't be safely seeded by SQL. Create 2–3 accounts
  through the app's sign-up flow, make one a worker, then (optionally) run
  `supabase/seed_hosted_helpers.sql` in the SQL Editor to promote them into rich demo
  profiles — it has clearly-marked variables at the top for the user IDs.

---

## 5. Verify the stack end-to-end

1. `curl "$SUPABASE_URL/functions/v1/keepwarm"` → `{"ok":true,...}`
2. AI service `GET /health` → `{"status":"ok"}`; `GET /health/deep` also checks
   Supabase + LLM reachability.
3. In the app: sign up → complete a worker profile → its service description gets
   embedded (edge `embed-text`) → from a customer account describe a job
   ("mi pipe under di sink a leak") → matching returns the plumber first.
4. BizBot: ask "Do I need a TRN?" → grounded answer with a citation from the KB.
5. Verification (dev build): consent → ID upload → liveness (turn left/right, blink) →
   selfie → verified tier unlocks. A printed photo must fail the liveness gate.

---

## 6. Free-tier limits cheat sheet

| Service | Limit | Mitigation in this repo |
| --- | --- | --- |
| Supabase | 500 MB DB, 1 GB storage, pauses after 7 days idle | keep-warm workflow; embeddings not raw images |
| Gemini | ~1,500 req/day free | Groq failover wired into every LLM call |
| Groq | rate-limited free tier | second in the failover chain, exponential backoff |
| Render | cold start after idle | app shows progress states; warm before pitching |
| Expo EAS | 15 builds/platform/month | prefer local `expo run:android` |

---

## 7. Placeholder checklist (everything you must fill in)

| # | Where | Key | Get it from |
| --- | --- | --- | --- |
| 1 | `app/.env` | `EXPO_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → Data API |
| 2 | `app/.env` | `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Project Settings → API Keys (anon) |
| 3 | `app/.env` | `EXPO_PUBLIC_AI_SERVICE_URL` | `http://localhost:8000` or your Render URL |
| 4 | `ai-service/.env` | `SUPABASE_URL` | same as #1 |
| 5 | `ai-service/.env` | `SUPABASE_ANON_KEY` | same as #2 (used to verify user JWTs) |
| 6 | `ai-service/.env` | `SUPABASE_SERVICE_ROLE_KEY` | Supabase → API Keys (service_role) — server-side only |
| 7 | `ai-service/.env` | `GEMINI_API_KEY` | aistudio.google.com/apikey |
| 8 | `ai-service/.env` | `GROQ_API_KEY` | console.groq.com/keys |
| 9 | Supabase secrets | `GEMINI_API_KEY`, `GROQ_API_KEY` | `supabase secrets set ...` (§1.4) |
| 10 | GitHub Actions secrets | `SUPABASE_URL`, `SUPABASE_ANON_KEY` | repo Settings → Secrets (§1.5) |
| 11 | `app/app.json` | `extra.eas.projectId` | `eas init` (only for EAS builds/push) |
| 12 | `docs/kb/*.md` | real source text + `source_url` | official TAJ / COJ / NIS publications |
| 13 | `supabase/seed_hosted_helpers.sql` | demo user UUIDs | Supabase → Authentication → Users |

---

## 8. Troubleshooting

- **"Network request failed" in the app on a device** — `localhost` won't reach your
  machine from a phone. Use your LAN IP for `EXPO_PUBLIC_AI_SERVICE_URL`
  (e.g. `http://192.168.1.20:8000`) and make sure the phone is on the same network.
- **AI features spin for ~1 min then work** — free-host cold start; expected. Warm the
  service before demos.
- **LLM returns 429** — you hit Gemini's daily free quota; the failover automatically
  moves to Groq. If both are exhausted, BizBot answers degrade to "try again later" —
  wait for quota reset.
- **`supabase db push` fails on `vector`/`postgis`** — free projects have both
  extensions available; make sure migration `0001` ran first (`supabase migration list`).
- **Liveness screen shows "requires a development build"** — you're in Expo Go; build a
  dev client (§3.2).
- **Bundling fails with `EXPO_ROUTER_APP_ROOT` / `require.context` or a missing Babel
  plugin** — the Babel toolchain didn't resolve. `babel-preset-expo` and the plugins the
  worklets transform needs are pinned in `app/package.json`, so this means a stale or
  mixed install: delete `node_modules`, run `npm install` (keep `package-lock.json` —
  it's committed on purpose), then restart with `npx expo start --clear`.
- **Project paused** — free Supabase pauses after inactivity; restore from the dashboard,
  then confirm the keep-warm workflow secrets are set (§1.5).
