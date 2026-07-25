"""Thin PostgREST client using the service-role key.

The service-role key lives ONLY here and in edge functions (SR-13). Kept as
explicit httpx calls — no ORM — so every privileged access is visible.
"""

from typing import Any

import httpx

from app.core.config import get_settings


class SupabaseError(Exception):
    pass


def _headers() -> dict[str, str]:
    settings = get_settings()
    key = settings.supabase_service_role_key
    return {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
    }


def _base() -> str:
    return f"{get_settings().supabase_url}/rest/v1"


async def select_one(table: str, filters: dict[str, str], columns: str = "*") -> dict[str, Any] | None:
    params = {"select": columns, **{k: f"eq.{v}" for k, v in filters.items()}, "limit": "1"}
    async with httpx.AsyncClient(timeout=15.0) as client:
        res = await client.get(f"{_base()}/{table}", params=params, headers=_headers())
    if res.status_code != 200:
        raise SupabaseError(f"select {table}: HTTP {res.status_code} {res.text[:300]}")
    rows = res.json()
    return rows[0] if rows else None


async def upsert(table: str, row: dict[str, Any], on_conflict: str) -> None:
    async with httpx.AsyncClient(timeout=15.0) as client:
        res = await client.post(
            f"{_base()}/{table}",
            params={"on_conflict": on_conflict},
            headers={**_headers(), "Prefer": "resolution=merge-duplicates"},
            json=row,
        )
    if res.status_code not in (200, 201, 204):
        raise SupabaseError(f"upsert {table}: HTTP {res.status_code} {res.text[:300]}")


async def update(table: str, filters: dict[str, str], patch: dict[str, Any]) -> None:
    params = {k: f"eq.{v}" for k, v in filters.items()}
    async with httpx.AsyncClient(timeout=15.0) as client:
        res = await client.patch(
            f"{_base()}/{table}", params=params, headers=_headers(), json=patch
        )
    if res.status_code not in (200, 204):
        raise SupabaseError(f"update {table}: HTTP {res.status_code} {res.text[:300]}")


async def rpc(fn: str, args: dict[str, Any]) -> Any:
    async with httpx.AsyncClient(timeout=30.0) as client:
        res = await client.post(f"{_base()}/rpc/{fn}", headers=_headers(), json=args)
    if res.status_code not in (200, 204):
        raise SupabaseError(f"rpc {fn}: HTTP {res.status_code} {res.text[:300]}")
    return res.json() if res.content else None
