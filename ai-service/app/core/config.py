"""Application settings — every value comes from the environment (SR-14)."""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    supabase_url: str = ""
    supabase_anon_key: str = ""
    supabase_service_role_key: str = ""

    gemini_api_key: str = ""
    groq_api_key: str = ""

    # Cosine-similarity cutoff for ArcFace embeddings. Model-specific — this is
    # a sensible demo value, NOT a universal constant. Calibrate FAR/FRR before
    # relying on it beyond the prototype (CLAUDE.md §5).
    face_match_threshold: float = 0.35

    cors_origins: str = "*"

    llm_timeout_seconds: float = 25.0

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
