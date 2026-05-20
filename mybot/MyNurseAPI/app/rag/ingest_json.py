"""
JSON knowledge base ingestion pipeline.
Loads source JSON, normalizes it into LangChain Document objects.
"""
import json
import os
from typing import List
from langchain_core.documents import Document
from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)


def load_knowledge_json(path: str | None = None) -> List[Document]:
    """Load the hospital knowledge base JSON and return LangChain Documents."""
    source_path = path or settings.source_json_path
    if not os.path.exists(source_path):
        logger.error(f"Knowledge base file not found: {source_path}")
        return []

    with open(source_path, "r", encoding="utf-8") as f:
        records = json.load(f)

    documents: List[Document] = []
    for record in records:
        # Build page content from title + content fields
        page_content = f"{record.get('title', '')}\n\n{record.get('content', '')}"
        metadata = {
            "id": record.get("id", ""),
            "category": record.get("category", "general"),
            "risk_level": record.get("risk_level", "low"),
            "keywords": record.get("keywords", []),
            "version": record.get("version", "1.0"),
            "source": "hospital_knowledge_base",
        }
        documents.append(Document(page_content=page_content, metadata=metadata))

    logger.info(f"Loaded {len(documents)} knowledge base documents from {source_path}")
    return documents
