"""
FastAPI application entry point for the Hospital Intake Bot.
"""
import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from app.core.config import settings
from app.core.logging import setup_logging, get_logger
from app.api.routes import chat, stt, tts, sessions, admin, report
from app.rag.ingest_json import load_knowledge_json
from app.rag.chunker import chunk_documents
from app.rag.vectorstore import build_vectorstore, load_vectorstore
from app.db.database import init_db

logger = get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    setup_logging(debug=settings.debug)
    logger.info(f"Starting {settings.project_name}")
    os.makedirs(settings.audio_store_path, exist_ok=True)
    os.makedirs(settings.vector_store_path, exist_ok=True)

    # Init SQLite tables
    init_db()
    logger.info("SQLite database initialized")

    # Build or load vectorstore
    vs = load_vectorstore()
    if vs is None:
        docs = load_knowledge_json()
        if docs:
            chunks = chunk_documents(docs)
            build_vectorstore(chunks)
            logger.info(f"Vectorstore built with {len(chunks)} chunks")
        else:
            logger.warning("No knowledge base documents found")
    else:
        logger.info("Vectorstore loaded from disk")

    yield
    logger.info("Shutting down...")


app = FastAPI(
    title=settings.project_name,
    version="1.0.0",
    description="AI-powered hospital intake conversational assistant with RAG, STT, TTS, and rich reporting",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── API Routes ────────────────────────────────────────────────────────────────
app.include_router(chat.router,     prefix=settings.api_v1_str)
app.include_router(stt.router,      prefix=settings.api_v1_str)
app.include_router(tts.router,      prefix=settings.api_v1_str)
app.include_router(sessions.router, prefix=settings.api_v1_str)
app.include_router(admin.router,    prefix=settings.api_v1_str)
app.include_router(report.router,   prefix=settings.api_v1_str)


@app.get("/health")
@app.get("/api/v1/health")
async def health():
    return {"status": "ok", "project": settings.project_name}


# ── Frontend Static Files ─────────────────────────────────────────────────────
frontend_dir = os.path.join(os.path.dirname(__file__), "..", "frontend")
if os.path.isdir(frontend_dir):
    app.mount("/static", StaticFiles(directory=frontend_dir), name="static")

    @app.get("/", include_in_schema=False)
    async def serve_frontend():
        return FileResponse(os.path.join(frontend_dir, "index.html"))

    @app.get("/report", include_in_schema=False)
    async def serve_report():
        return FileResponse(os.path.join(frontend_dir, "report.html"))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host=settings.host, port=settings.port, reload=settings.debug)
