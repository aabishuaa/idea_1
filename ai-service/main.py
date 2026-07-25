"""MyB AI service — the only Python surface (CLAUDE.md §2).

Owns exactly two things:
  1. Face embedding + cosine match (verification gates 1 and 4).
  2. RAG retrieval/generation orchestration for BizBot Q&A.

Deterministic business rules live in Supabase, not here.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import get_settings
from app.routers import face, health, rag

app = FastAPI(
    title="MyB AI Service",
    description="Face verification (embed + match) and BizBot RAG for MyB.",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=get_settings().cors_origin_list,
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Authorization", "Content-Type"],
)

app.include_router(health.router)
app.include_router(face.router)
app.include_router(rag.router)
