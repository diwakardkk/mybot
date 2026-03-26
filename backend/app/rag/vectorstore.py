"""
FAISS vector store — builds, persists, and loads the knowledge base index.
"""
import os
from typing import List, Optional
from langchain_core.documents import Document
from langchain_community.vectorstores import FAISS
from app.rag.embedder import get_embeddings
from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)

_vectorstore: Optional[FAISS] = None


def get_vectorstore() -> Optional[FAISS]:
    return _vectorstore


def build_vectorstore(documents: List[Document]) -> FAISS:
    """Build a FAISS index from documents and cache it in-memory + on disk."""
    global _vectorstore
    embeddings = get_embeddings()
    _vectorstore = FAISS.from_documents(documents, embeddings)

    os.makedirs(settings.vector_store_path, exist_ok=True)
    _vectorstore.save_local(settings.vector_store_path)
    logger.info(f"Built and saved vectorstore with {len(documents)} chunks at {settings.vector_store_path}")
    return _vectorstore


def load_vectorstore() -> Optional[FAISS]:
    """Load a previously saved FAISS index from disk."""
    global _vectorstore
    index_file = os.path.join(settings.vector_store_path, "index.faiss")
    if not os.path.exists(index_file):
        logger.warning("No saved vectorstore found. Run ingest_data.py first.")
        return None
    embeddings = get_embeddings()
    _vectorstore = FAISS.load_local(
        settings.vector_store_path,
        embeddings,
        allow_dangerous_deserialization=True,
    )
    logger.info(f"Loaded vectorstore from {settings.vector_store_path}")
    return _vectorstore


def ensure_vectorstore() -> Optional[FAISS]:
    """Return the in-memory store or load from disk if available."""
    if _vectorstore is not None:
        return _vectorstore
    return load_vectorstore()
