# app/ — the myB mobile app (Expo, TypeScript strict)

All UI plus the on-device liveness challenge. Talks to Supabase directly
(anon key + RLS) and to the AI service for face match + BizBot RAG.

## Run

```bash
cp .env.example .env      # fill in (SETUP.md §3)
npm install
npm start                 # Expo Go (expo start --go) — everything except camera liveness
npx expo run:android      # custom dev build — full liveness (ML Kit)
npm run typecheck
```

`npm start` forces Expo Go mode so the QR always opens in the Expo Go app,
even though `expo-dev-client` is installed. When you're testing against a
dev build instead, use `npm run start:devclient`.

If dependency versions drift from your installed Expo SDK, run
`npx expo install --fix` to realign them.

## Layout

```
app/                      # expo-router routes (file = screen)
  (auth)/                 # onboarding, sign-in, sign-up
  (tabs)/                 # home, search, bookings, profile (+ center action)
  worker/[id]             # pro profile
  job/new, job/[id]       # request + lifecycle + review
  messages, thread/[id]   # inbox + realtime chat
  verification/*          # consent → ID → liveness → result (two gates)
  formalize/*             # dashboard, questionnaire, checklist, BizBot
  earnings                # worker earnings
src/
  theme/                  # design tokens (from the myB Design System) + ThemeProvider
  components/ui/          # Button, Input, Card, chips/badges, Avatar, Rating, …
  features/liveness/      # ML Kit challenge state machine (dev build only)
  lib/                    # supabase, ai-service, edge-function clients
  providers/              # Auth session + profile context
```

## Design system

`src/theme/tokens.ts` is the single source of truth — exported from the design
artifact (dark default + light pairing, Plus Jakarta Sans scale, base-4
spacing, 5 radius steps, per-theme elevation). Don't hardcode colors in
screens; use `useTheme()`.

Placeholder assets: `assets/*.png` are generated placeholder marks — swap them
for the final logo/splash when branding lands (same filenames, no code change).

## Rules

- No `any` without a justifying comment.
- The anon key is the only secret-ish value allowed here; RLS is the boundary.
- Anything that can cold-start (AI service, LLMs) must show a progress state,
  never a silent hang (SR-6).
- Liveness (gate 2) and face match (gate 4) stay separate — don't merge flows.
