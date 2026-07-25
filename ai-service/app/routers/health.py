from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.core.config import Settings, get_settings
from app.services import supabase
from app.services.faces import engine_status

router = APIRouter(tags=["health"])


class HealthResponse(BaseModel):
    status: str
    face_engine: str


class DeepHealthResponse(BaseModel):
    status: str
    face_engine: str
    supabase: str
    gemini_key: bool
    groq_key: bool


@router.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    """Cheap liveness probe — also the warm-up target before demos."""
    return HealthResponse(status="ok", face_engine=engine_status())


@router.get("/health/deep", response_model=DeepHealthResponse)
async def deep_health(settings: Settings = Depends(get_settings)) -> DeepHealthResponse:
    try:
        await supabase.select_one("app_config", {"key": "matching_weights"}, "key")
        supabase_status = "ok"
    except Exception as exc:  # noqa: BLE001 — health endpoint reports, never raises
        supabase_status = f"error: {exc.__class__.__name__}"

    return DeepHealthResponse(
        status="ok" if supabase_status == "ok" else "degraded",
        face_engine=engine_status(),
        supabase=supabase_status,
        gemini_key=bool(settings.gemini_api_key),
        groq_key=bool(settings.groq_api_key),
    )
