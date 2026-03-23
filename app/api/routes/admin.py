"""
Admin routes — data ingestion trigger, audit log.
"""
from fastapi import APIRouter
from app.rag.ingest_json import load_knowledge_json
from app.rag.chunker import chunk_documents
from app.rag.vectorstore import build_vectorstore
from app.db.audit_repo import get_audit_log
from app.core.logging import get_logger

router = APIRouter(prefix="/admin", tags=["admin"])
logger = get_logger(__name__)


@router.post("/ingest")
async def ingest_knowledge_base():
    """Load JSON knowledge base, chunk it, and build the vector index."""
    docs = load_knowledge_json()
    if not docs:
        return {"status": "error", "message": "No documents loaded"}
    chunks = chunk_documents(docs)
    build_vectorstore(chunks)
    return {"status": "ok", "documents": len(docs), "chunks": len(chunks)}


@router.get("/audit")
async def audit_log(conversation_id: str | None = None):
    """Return audit events."""
    return get_audit_log(conversation_id)


@router.get("/health")
async def health():
    return {"status": "ok"}
