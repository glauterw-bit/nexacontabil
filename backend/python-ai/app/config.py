from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # App
    app_name: str = "DomoSYS AI"
    debug: bool = False
    log_level: str = "info"

    # Database
    database_url: str = "postgresql+asyncpg://aura:aura_secret@localhost:5432/aura_accounting"

    # Redis
    redis_url: str = "redis://localhost:6379"

    # OpenAI
    openai_api_key: str = ""
    openai_model: str = "gpt-4o"
    openai_vision_model: str = "gpt-4o"

    # Anthropic
    anthropic_api_key: str = ""
    anthropic_model: str = "claude-3-5-sonnet-20241022"

    # Pinecone
    pinecone_api_key: str = ""
    pinecone_environment: str = "us-east-1"
    pinecone_index_name: str = "domosys"

    # AWS S3
    aws_access_key_id: str = ""
    aws_secret_access_key: str = ""
    aws_region: str = "us-east-1"
    s3_bucket_name: str = "domosys-docs"

    # NestJS API (para persistir documentos no banco)
    nestjs_api_url: str = "http://localhost:3001"

    # WhatsApp / Evolution API
    evolution_api_url: str = "http://localhost:8080"
    evolution_api_key: str = "aura-evolution-key"
    whatsapp_webhook_base_url: str = "http://localhost:8000"

    # ElevenLabs TTS (voz mais natural e expressiva)
    elevenlabs_api_key: str = ""
    elevenlabs_voice_female: str = "cgSgspJ2msm6clMCkdW9"   # Jessica - Playful, Bright, Warm
    elevenlabs_voice_male: str = "IKne3meq5aSn9XLyUdCD"     # Charlie - Deep, Confident, Energetic

    # LLM retry config
    llm_max_retries: int = 3
    llm_retry_delay: float = 1.0

    class Config:
        env_file = ".env"
        case_sensitive = False


@lru_cache()
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
