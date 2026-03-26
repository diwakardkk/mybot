from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


PROJECT_ROOT = Path(__file__).resolve().parents[2]
DEMO_API_ROOT = Path(__file__).resolve().parents[1]


class Settings(BaseSettings):
    openai_api_key: str
    openai_chat_model: str = "gpt-4o-mini"
    openai_embedding_model: str = "text-embedding-3-small"
    knowledge_base_path: str = str(PROJECT_ROOT / "data" / "source_json" / "hospital_knowledge.json")
    vector_store_path: str = str(PROJECT_ROOT / "data" / "vectorstore_demo_api")
    cors_origins: str = "*"
    max_history_messages: int = 8
    project_name: str = "Hospital Knowledge Demo API"

    model_config = SettingsConfigDict(
        env_file=str(DEMO_API_ROOT / ".env"),
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    @property
    def cors_origin_list(self) -> list[str]:
        raw = self.cors_origins.strip()
        if raw == "*":
            return ["*"]
        return [item.strip() for item in raw.split(",") if item.strip()]


settings = Settings()
