"""
Retrieval service — wraps the RAG retriever for use by conversation flow.
"""
from typing import List
from langchain_core.documents import Document
from app.rag.retriever import retrieve_context, format_context
from app.core.logging import get_logger

logger = get_logger(__name__)


def get_context_for_query(query: str, k: int = 4) -> str:
    """High-level: retrieve and format knowledge base context for a query."""
    docs: List[Document] = retrieve_context(query, k=k)
    return format_context(docs)


def has_emergency_keyword(text: str) -> bool:
    """Check text against emergency keyword list."""
    from app.core.prompts import EMERGENCY_KEYWORDS
    lower = text.lower()
    return any(kw in lower for kw in EMERGENCY_KEYWORDS)
