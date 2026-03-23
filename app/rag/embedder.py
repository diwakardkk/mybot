"""
Embedding wrapper using OpenAI text-embedding-3-small.
"""
from langchain_openai import OpenAIEmbeddings
from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)

_embeddings: OpenAIEmbeddings | None = None


def get_embeddings() -> OpenAIEmbeddings:
    global _embeddings
    if _embeddings is None:
        _embeddings = OpenAIEmbeddings(
            model=settings.openai_embedding_model,
            openai_api_key=settings.openai_api_key,
        )
        logger.info(f"Initialized embeddings model: {settings.openai_embedding_model}")
    return _embeddings
