"""Ingest the BizBot knowledge base into Supabase (FR-ADM-1).

Reads docs/kb/*.md (front-matter-tagged by country/parish/topic), chunks each
document, embeds every chunk with Gemini text-embedding-004 (768 dims), and
upserts into kb_documents / kb_chunks using the service-role key.

Usage (from ai-service/, with .env filled in):
    python scripts/ingest_kb.py ../docs/kb
Re-run after editing any KB file — chunks for changed documents are replaced.
"""

import asyncio
import re
import sys
from pathlib import Path
from typing import Any

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.config import get_settings  # noqa: E402
from app.services.embeddings import embed_text  # noqa: E402

CHUNK_CHARS = 900
CHUNK_OVERLAP = 150


def parse_front_matter(text: str) -> tuple[dict[str, str], str]:
    match = re.match(r"^---\n(.*?)\n---\n(.*)$", text, re.S)
    if not match:
        return {}, text
    meta: dict[str, str] = {}
    for line in match.group(1).splitlines():
        if ":" in line:
            key, _, value = line.partition(":")
            meta[key.strip()] = value.strip().strip('"')
    return meta, match.group(2)


def chunk_text(body: str) -> list[str]:
    """Paragraph-aware chunking with overlap."""
    paragraphs = [p.strip() for p in re.split(r"\n{2,}", body) if p.strip()]
    chunks: list[str] = []
    current = ""
    for para in paragraphs:
        if len(current) + len(para) + 2 > CHUNK_CHARS and current:
            chunks.append(current.strip())
            current = current[-CHUNK_OVERLAP:] + "\n\n" + para
        else:
            current = f"{current}\n\n{para}" if current else para
    if current.strip():
        chunks.append(current.strip())
    return chunks


def _headers() -> dict[str, str]:
    settings = get_settings()
    key = settings.supabase_service_role_key
    return {"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json"}


async def upsert_document(client: httpx.AsyncClient, meta: dict[str, str], slug: str) -> str:
    settings = get_settings()
    row: dict[str, Any] = {
        "slug": slug,
        "title": meta.get("title", slug),
        "country": meta.get("country", "JM"),
        "parish": meta.get("parish") or None,
        "topic": meta.get("topic", "general"),
        "source_name": meta.get("source_name", ""),
        "source_url": meta.get("source_url", ""),
        "updated_at": "now()",
    }
    res = await client.post(
        f"{settings.supabase_url}/rest/v1/kb_documents",
        params={"on_conflict": "slug"},
        headers={**_headers(), "Prefer": "resolution=merge-duplicates,return=representation"},
        json=row,
    )
    res.raise_for_status()
    return res.json()[0]["id"]


async def replace_chunks(
    client: httpx.AsyncClient, doc_id: str, meta: dict[str, str], chunks: list[str]
) -> None:
    settings = get_settings()
    delete = await client.delete(
        f"{settings.supabase_url}/rest/v1/kb_chunks",
        params={"document_id": f"eq.{doc_id}"},
        headers=_headers(),
    )
    delete.raise_for_status()

    rows = []
    for index, content in enumerate(chunks):
        embedding = await embed_text(content)
        rows.append(
            {
                "document_id": doc_id,
                "chunk_index": index,
                "content": content,
                "country": meta.get("country", "JM"),
                "parish": meta.get("parish") or None,
                "topic": meta.get("topic", "general"),
                "embedding": embedding,
            }
        )

    res = await client.post(
        f"{settings.supabase_url}/rest/v1/kb_chunks", headers=_headers(), json=rows
    )
    res.raise_for_status()


async def main(kb_dir: Path) -> None:
    files = sorted(kb_dir.glob("*.md"))
    files = [f for f in files if f.name.lower() != "readme.md"]
    if not files:
        print(f"No .md files found in {kb_dir}")
        return

    async with httpx.AsyncClient(timeout=30.0) as client:
        for path in files:
            meta, body = parse_front_matter(path.read_text(encoding="utf-8"))
            slug = meta.get("slug", path.stem)
            chunks = chunk_text(body)
            print(f"{path.name}: {len(chunks)} chunks …", end=" ", flush=True)
            doc_id = await upsert_document(client, meta, slug)
            await replace_chunks(client, doc_id, meta, chunks)
            print("done")

    print("KB ingest complete.")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(__doc__)
        sys.exit(1)
    asyncio.run(main(Path(sys.argv[1])))
