"""BizBot RAG endpoint — the conversational Q&A side ONLY (FR-BIZ-5).

Checklists, questionnaires, and step sequencing are deterministic Supabase
config (never RAG — CLAUDE.md §4.3). This endpoint answers open questions
("What is GCT?", "Do I need a TRN?") grounded in the country/parish-tagged
knowledge base, always citing sources, never inventing tax/registration rules.
"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.core.auth import CallerIdentity, require_user
from app.services import supabase
from app.services.embeddings import embed_text
from app.services.llm import ChatMessage, LlmUnavailableError, chat_complete

router = APIRouter(prefix="/rag", tags=["rag"])

_MIN_SIMILARITY = 0.35  # below this the KB simply doesn't cover the question


class RagQuery(BaseModel):
    question: str = Field(min_length=3, max_length=1000)
    country: str = Field(default="JM", pattern="^[A-Z]{2}$")
    parish: str | None = None
    history: list[ChatMessage] = Field(default_factory=list, max_length=10)


class RagSource(BaseModel):
    title: str
    source_name: str
    source_url: str
    similarity: float


class RagAnswer(BaseModel):
    answer: str
    sources: list[RagSource]
    grounded: bool
    provider: str | None = None


_SYSTEM_PROMPT = """You are BizBot, the friendly business-formalization guide inside the MyB app, speaking to informal skilled workers in Jamaica.

Rules you must never break:
- Answer ONLY from the numbered context passages provided. They are the sole source of truth.
- Cite passages inline like [1] or [2] after the sentences they support.
- If the context does not contain the answer, say plainly that you don't have that information yet and suggest asking Tax Administration Jamaica (TAJ) or the Companies Office of Jamaica (COJ). NEVER guess or invent tax rules, fees, thresholds, or registration steps.
- Use warm, plain language. Short sentences. No jargon without a one-line explanation. It's fine to mirror light Jamaican phrasing, but stay clear.
- Keep answers under 180 words.
- Amounts and fees change: if the context includes an amount, mention it may have been updated and where to confirm it."""


@router.post("/query", response_model=RagAnswer)
async def query(
    body: RagQuery,
    caller: CallerIdentity = Depends(require_user),  # noqa: ARG001 — auth gate
) -> RagAnswer:
    try:
        question_embedding = await embed_text(body.question)
    except LlmUnavailableError as exc:
        raise HTTPException(status_code=503, detail={"error": "llm_unavailable", "attempts": exc.attempts}) from exc

    chunks = await supabase.rpc(
        "match_kb_chunks",
        {
            "p_embedding": question_embedding,
            "p_country": body.country,
            "p_parish": body.parish,
            "p_limit": 6,
        },
    ) or []

    relevant = [c for c in chunks if float(c.get("similarity") or 0) >= _MIN_SIMILARITY]

    if not relevant:
        return RagAnswer(
            answer=(
                "Mi nuh have solid information on that yet. For anything about taxes or "
                "registration it's best to check directly with Tax Administration Jamaica "
                "(jamaicatax.gov.jm) or the Companies Office of Jamaica (orcjamaica.com) "
                "so you get the current rules."
            ),
            sources=[],
            grounded=False,
        )

    context = "\n\n".join(
        f"[{i + 1}] ({c['doc_title']} — {c['source_name']})\n{c['content']}"
        for i, c in enumerate(relevant)
    )

    messages: list[ChatMessage] = [
        ChatMessage(role="system", content=_SYSTEM_PROMPT),
        *body.history,
        ChatMessage(
            role="user",
            content=f"Context passages:\n\n{context}\n\nQuestion: {body.question}",
        ),
    ]

    try:
        answer, provider = await chat_complete(messages, temperature=0.3)
    except LlmUnavailableError as exc:
        raise HTTPException(status_code=503, detail={"error": "llm_unavailable", "attempts": exc.attempts}) from exc

    return RagAnswer(
        answer=answer.strip(),
        sources=[
            RagSource(
                title=c["doc_title"],
                source_name=c["source_name"],
                source_url=c["source_url"],
                similarity=float(c["similarity"]),
            )
            for c in relevant
        ],
        grounded=True,
        provider=provider,
    )
