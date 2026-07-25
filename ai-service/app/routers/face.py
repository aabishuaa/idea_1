"""Face verification endpoints — gates 1 and 4 of the pipeline (CLAUDE.md §5).

Gate 1  POST /face/embed-id : crop the face from the government ID, store its embedding.
Gate 4  POST /face/match    : embed the post-liveness selfie, cosine-match vs the ID.

Liveness (gate 2) is on-device and is NOT handled here — cosine similarity only
does matching, never liveness. DPA: we store embeddings, not selfie images
(SR-17); the ID image pointer is dropped once matching succeeds.
"""

from fastapi import APIRouter, Depends, HTTPException, UploadFile
from pydantic import BaseModel

from app.core.auth import CallerIdentity, require_user
from app.core.config import Settings, get_settings
from app.services import supabase
from app.services.faces import (
    FaceEngineUnavailable,
    NoFaceDetected,
    cosine_similarity,
    extract_face_embedding,
)

router = APIRouter(prefix="/face", tags=["face"])

_MAX_IMAGE_BYTES = 8 * 1024 * 1024


class EmbedIdResponse(BaseModel):
    status: str
    dimensions: int


class MatchResponse(BaseModel):
    passed: bool
    similarity: float
    threshold: float
    verification_status: str


async def _read_image(file: UploadFile) -> bytes:
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="empty file")
    if len(data) > _MAX_IMAGE_BYTES:
        raise HTTPException(status_code=413, detail="image larger than 8 MB")
    return data


def _face_errors(exc: Exception) -> HTTPException:
    if isinstance(exc, FaceEngineUnavailable):
        return HTTPException(status_code=503, detail="face_engine_unavailable")
    if isinstance(exc, NoFaceDetected):
        return HTTPException(status_code=422, detail="no_face_detected")
    return HTTPException(status_code=500, detail="face_processing_failed")


@router.post("/embed-id", response_model=EmbedIdResponse)
async def embed_id(
    file: UploadFile,
    caller: CallerIdentity = Depends(require_user),
) -> EmbedIdResponse:
    """Gate 1: detect + crop the face on the uploaded government ID and store
    its embedding on the caller's verification record."""
    record = await supabase.select_one(
        "verification_records", {"user_id": caller.user_id}, "user_id,consent_given_at"
    )
    if record is None or not record.get("consent_given_at"):
        # SR-16: no biometric processing without explicit prior consent.
        raise HTTPException(status_code=409, detail="consent_required")

    image = await _read_image(file)
    try:
        embedding = extract_face_embedding(image)
    except (FaceEngineUnavailable, NoFaceDetected) as exc:
        raise _face_errors(exc) from exc

    await supabase.update(
        "verification_records",
        {"user_id": caller.user_id},
        {
            "id_embedding": embedding,
            "id_captured_at": "now()",
            "status": "id_captured",
        },
    )
    return EmbedIdResponse(status="id_captured", dimensions=len(embedding))


@router.post("/match", response_model=MatchResponse)
async def match(
    file: UploadFile,
    caller: CallerIdentity = Depends(require_user),
    settings: Settings = Depends(get_settings),
) -> MatchResponse:
    """Gate 4: embed the frontal selfie captured after the on-device liveness
    challenge and compare it to the stored ID embedding. The verified tier is
    granted (SQL-side) only when BOTH liveness and match passed (FR-VER-5)."""
    record = await supabase.select_one(
        "verification_records",
        {"user_id": caller.user_id},
        "user_id,id_embedding,liveness_passed",
    )
    if record is None or not record.get("id_embedding"):
        raise HTTPException(status_code=409, detail="id_embedding_missing")
    if not record.get("liveness_passed"):
        # Order of gates matters: match without liveness proves nothing.
        raise HTTPException(status_code=409, detail="liveness_not_passed")

    image = await _read_image(file)
    try:
        selfie_embedding = extract_face_embedding(image)
    except (FaceEngineUnavailable, NoFaceDetected) as exc:
        raise _face_errors(exc) from exc

    stored = record["id_embedding"]
    if isinstance(stored, str):
        # PostgREST returns vector columns as their text form "[0.1,0.2,...]".
        stored = [float(x) for x in stored.strip("[]").split(",")]

    similarity = cosine_similarity(stored, selfie_embedding)
    passed = similarity >= settings.face_match_threshold

    status = await supabase.rpc(
        "finalize_identity_verification",
        {"p_user": caller.user_id, "p_score": round(similarity, 4), "p_passed": passed},
    )

    return MatchResponse(
        passed=passed,
        similarity=round(similarity, 4),
        threshold=settings.face_match_threshold,
        verification_status=str(status),
    )
