# ai-service/ — face match + RAG (the only Python surface)

FastAPI service owning exactly two responsibilities (CLAUDE.md §2):

1. **Face embedding + cosine match** — verification gates 1 (ID face → embedding)
   and 4 (selfie ↔ ID match). Liveness is on-device and never handled here.
2. **RAG orchestration** — BizBot's open Q&A, grounded in the country-tagged KB
   with citations. Checklists/questionnaires are deterministic Supabase config,
   never RAG.

## Endpoints

| Method + path | Auth | Purpose |
| --- | --- | --- |
| `GET /health` | none | liveness + face-engine state (warm-up target) |
| `GET /health/deep` | none | + Supabase reachability, LLM key presence |
| `POST /face/embed-id` | user JWT | multipart `file` (ID photo) → stores 512-dim ArcFace embedding |
| `POST /face/match` | user JWT | multipart `file` (selfie) → cosine vs stored ID embedding → finalizes verification |
| `POST /rag/query` | user JWT | `{question, country, parish?, history?}` → grounded answer + sources |

Auth: the app forwards the user's **Supabase access token**; the service verifies
it against Supabase Auth. The service-role key lives only in this service's env.

## Run

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # fill in REPLACE_ME values
uvicorn main:app --reload
pytest                 # quick sanity tests (no network needed)
```

## Notes

- **Face engine**: InsightFace `buffalo_l` (ArcFace) on CPU; the model
  (~300 MB) downloads on first use. If the libs are unavailable the service
  degrades: `/face/*` returns `503 face_engine_unavailable`, everything else works.
- **Threshold**: `FACE_MATCH_THRESHOLD=0.35` is a demo-sensible ArcFace cosine
  cutoff, not a universal constant — calibrate FAR/FRR before production.
- **Failover**: every LLM call tries Gemini 2.5 Flash then Groq Llama; 429s and
  timeouts fail over, both-down returns a retryable 503 (the app shows progress
  states — free hosts cold-start).
- **KB ingest**: `python scripts/ingest_kb.py ../docs/kb` (service-role key
  required; re-run after KB edits).
