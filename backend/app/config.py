from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Database
    DATABASE_URL: str = "postgresql+asyncpg://ragcheck:ragcheck_dev@postgres:5432/ragcheck"
    DATABASE_URL_SYNC: str = "postgresql://ragcheck:ragcheck_dev@postgres:5432/ragcheck"

    # Redis (DB 0 = app cache/sessions, DB 1 = Celery results, DB 2 = Celery broker)
    REDIS_URL: str = "redis://redis:6379/0"

    # File storage
    UPLOAD_DIR: str = "/uploads"

    # Celery
    CELERY_BROKER_URL: str = "redis://redis:6379/2"
    CELERY_RESULT_BACKEND: str = "redis://redis:6379/1"

    # CORS
    CORS_ORIGINS: str = "http://localhost:3000"

    # Evaluation
    EVAL_CONCURRENCY: int = 5

    # LLM
    LLM_PROVIDER: str = "gemini"  # gemini | anthropic | openai
    LLM_MODEL: str = "gemini-2.0-flash"
    LLM_MODEL_CHEAP: str = "gemini-2.0-flash"
    GEMINI_API_KEY: str = ""
    ANTHROPIC_API_KEY: str = ""
    OPENAI_API_KEY: str = ""

    # Embeddings
    EMBEDDING_PROVIDER: str = "local"  # local | openai
    EMBEDDING_MODEL: str = "text-embedding-3-small"
    EMBEDDING_MODEL_LOCAL: str = "paraphrase-multilingual-MiniLM-L12-v2"
    EMBEDDING_DIMENSIONS: int = 384

    model_config = {"env_file": ".env", "extra": "ignore"}


settings = Settings()
