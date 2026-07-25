"""Caller authentication.

The app sends the user's Supabase access token; we verify it against Supabase
Auth server-side (SR-12 — never trust client-side checks). No static API keys
ship in the client bundle (SR-13).
"""

import httpx
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel

from app.core.config import Settings, get_settings

_bearer = HTTPBearer(auto_error=False)


class CallerIdentity(BaseModel):
    user_id: str
    email: str | None = None


async def require_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
    settings: Settings = Depends(get_settings),
) -> CallerIdentity:
    if credentials is None:
        raise HTTPException(status_code=401, detail="missing bearer token")

    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            res = await client.get(
                f"{settings.supabase_url}/auth/v1/user",
                headers={
                    "apikey": settings.supabase_anon_key,
                    "Authorization": f"Bearer {credentials.credentials}",
                },
            )
        except httpx.HTTPError as exc:
            raise HTTPException(status_code=503, detail="auth backend unreachable") from exc

    if res.status_code != 200:
        raise HTTPException(status_code=401, detail="invalid or expired token")

    payload = res.json()
    return CallerIdentity(user_id=payload["id"], email=payload.get("email"))
