from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    # App
    APP_NAME: str = "算法训练平台"
    VERSION: str = "0.1.0"
    DEBUG: bool = True

    # Database — defaults to SQLite for local dev; set DATABASE_URL for PostgreSQL
    DATABASE_URL: str = "sqlite+aiosqlite:///./train_model.db"
    DATABASE_URL_SYNC: str = "sqlite:///./train_model.db"

    # JWT
    SECRET_KEY: str = "change-me-in-production-use-a-long-random-string"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24  # 24 hours

    # CORS
    CORS_ORIGINS: list[str] = ["http://localhost:5173"]

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


@lru_cache()
def get_settings() -> Settings:
    return Settings()
