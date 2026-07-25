"""Text embeddings via Gemini text-embedding-004 (768 dims — matches the
vector(768) columns in Supabase). Groq has no embeddings endpoint, so there is
no failover here; callers surface a retryable 503 instead."""

import httpx

from app.core.config import get_settings
from app.services.llm import LlmUnavailableError

EMBEDDING_DIMENSIONS = 768
_URL = "https://generativelanguage.googleapis.com/v1beta/openai/embeddings"
_MODEL = "text-embedding-004"


async def embed_text(text: str) -> list[float]:
    settings = get_settings()
    if not settings.gemini_api_key:
        raise LlmUnavailableError(["gemini embeddings: no API key configured"])

    try:
        async with httpx.AsyncClient(timeout=settings.llm_timeout_seconds) as client:
            res = await client.post(
                _URL,
                json={"model": _MODEL, "input": text},
                headers={"Authorization": f"Bearer {settings.gemini_api_key}"},
            )
    except httpx.TimeoutException as exc:
        raise LlmUnavailableError(["gemini embeddings: timeout"]) from exc
    except httpx.HTTPError as exc:
        raise LlmUnavailableError([f"gemini embeddings: {exc.__class__.__name__}"]) from exc

    if res.status_code != 200:
        raise LlmUnavailableError([f"gemini embeddings: HTTP {res.status_code}"])

    data = res.json()
    vector = (data.get("data") or [{}])[0].get("embedding")
    if not vector:
        raise LlmUnavailableError(["gemini embeddings: empty response"])
    return vector
