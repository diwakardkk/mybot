from pydantic_settings import BaseSettings
from typing import Optional
from functools import lru_cache
import os


class Settings(BaseSettings):
    # Application
    project_name: str = "Hospital Intake Bot"
    api_v1_str: str = "/api/v1"
    debug: bool = False
    host: str = "0.0.0.0"
    port: int = 8000

    # OpenAI
    openai_api_key: str
    openai_chat_model: str = "gpt-4o"
    openai_embedding_model: str = "text-embedding-3-small"
    openai_tts_model: str = "tts-1"
    openai_tts_voice: str = "alloy"
    openai_stt_model: str = "whisper-1"

    # Speech backends
    stt_backend: str = "openai"  # "openai" | "faster_whisper"
    faster_whisper_model: str = "small"
    faster_whisper_compute_type: str = "int8"

    tts_backend: str = "openai"  # "openai" | "piper"
    piper_binary: str = "piper"
    piper_model_path: str = "./data/piper/en_US-amy-medium.onnx"
    piper_sentence_silence: float = 0.05  # seconds pause between sentences

    # Vector store
    vector_store_path: str = "./data/vectorstore"

    # Security
    secret_key: str = "change-this-to-a-very-secret-key-in-production"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 60

    # Database
    database_url: str = "sqlite:///./nurse_bot.db"

    # Redis
    redis_url: Optional[str] = None

    # Audio
    audio_store_path: str = "./data/audio"

    # Knowledge base
    source_json_path: str = "./data/source_json/hospital_knowledge.json"
    seed_questions_path: str = "./data/seed_questions.json"

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        case_sensitive = False


@lru_cache()
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
