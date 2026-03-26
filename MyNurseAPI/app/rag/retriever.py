"""
Retriever — searches the FAISS vectorstore for relevant knowledge chunks.
"""
from typing import List
from langchain_core.documents import Document
from app.rag.vectorstore import ensure_vectorstore
from app.core.logging import get_logger

logger = get_logger(__name__)


def retrieve_context(query: str, k: int = 4) -> List[Document]:
    """Retrieve top-k relevant documents for a given query."""
    store = ensure_vectorstore()
    if store is None:
        logger.warning("Vectorstore not available. No context retrieved.")
        return []
    try:
        docs = store.similarity_search(query, k=k)
        logger.info(f"Retrieved {len(docs)} context chunks for query: {query[:60]}")
        return docs
    except Exception as e:
        logger.error(f"Retrieval error: {e}")
        return []


def format_context(docs: List[Document]) -> str:
    """Format retrieved docs into a readable context block."""
    if not docs:
        return "No relevant knowledge base entries found."
    parts = []
    for i, doc in enumerate(docs, 1):
        cat = doc.metadata.get("category", "general")
        parts.append(f"[Source {i} — {cat}]\n{doc.page_content}")
    return "\n\n---\n\n".join(parts)
