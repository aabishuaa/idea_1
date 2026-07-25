"""LLM access with mandatory failover (SR-11).

Gemini 2.5 Flash is primary; Groq (Llama) is the failover. Both expose
OpenAI-compatible chat completions so a single code path serves both.
429s and timeouts fail over instead of failing the request.
"""

from dataclasses import dataclass
from typing import Literal

import httpx
from pydantic import BaseModel

from app.core.config import get_settings

Role = Literal["system", "user", "assistant"]


class ChatMessage(BaseModel):
    role: Role
    content: str


@dataclass(frozen=True)
class _Provider:
    name: str
    url: str
    model: str
    api_key: str


class LlmUnavailableError(Exception):
    def __init__(self, attempts: list[str]) -> None:
        self.attempts = attempts
        super().__init__(f"all LLM providers failed: {'; '.join(attempts)}")


def _providers() -> list[_Provider]:
    settings = get_settings()
    chain: list[_Provider] = []
    if settings.gemini_api_key:
        chain.append(
            _Provider(
                name="gemini",
                url="https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
                model="gemini-2.5-flash",
                api_key=settings.gemini_api_key,
            )
        )
    if settings.groq_api_key:
        chain.append(
            _Provider(
                name="groq",
                url="https://api.groq.com/openai/v1/chat/completions",
                model="llama-3.3-70b-versatile",
                api_key=settings.groq_api_key,
            )
        )
    return chain


async def chat_complete(
    messages: list[ChatMessage],
    *,
    temperature: float = 0.2,
    json_mode: bool = False,
) -> tuple[str, str]:
    """Returns (assistant_text, provider_name). Raises LlmUnavailableError."""
    settings = get_settings()
    attempts: list[str] = []

    for provider in _providers():
        body: dict[str, object] = {
            "model": provider.model,
            "messages": [m.model_dump() for m in messages],
            "temperature": temperature,
        }
        if json_mode:
            body["response_format"] = {"type": "json_object"}

        try:
            async with httpx.AsyncClient(timeout=settings.llm_timeout_seconds) as client:
                res = await client.post(
                    provider.url,
                    json=body,
                    headers={"Authorization": f"Bearer {provider.api_key}"},
                )
        except httpx.TimeoutException:
            attempts.append(f"{provider.name}: timeout")
            continue
        except httpx.HTTPError as exc:
            attempts.append(f"{provider.name}: {exc.__class__.__name__}")
            continue

        if res.status_code == 429:
            attempts.append(f"{provider.name}: rate limited (429)")
            continue
        if res.status_code != 200:
            attempts.append(f"{provider.name}: HTTP {res.status_code}")
            continue

        data = res.json()
        text = (data.get("choices") or [{}])[0].get("message", {}).get("content")
        if not text:
            attempts.append(f"{provider.name}: empty response")
            continue
        return text, provider.name

    if not attempts:
        attempts.append("no providers configured (set GEMINI_API_KEY / GROQ_API_KEY)")
    raise LlmUnavailableError(attempts)
