import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .models import ChatRequest, ChatResponse, ResetSessionRequest
from .service import build_vectorstore, generate_chat_reply
from .sessions import ensure_session, reset_session


logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        build_vectorstore(force=False)
    except Exception as exc:
        logging.getLogger(__name__).warning("Vector store warmup skipped: %s", exc)
    yield


app = FastAPI(
    title=settings.project_name,
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health():
    return {"status": "ok", "service": settings.project_name}


@app.post("/chat", response_model=ChatResponse)
async def chat(req: ChatRequest):
    session_id = ensure_session(req.session_id)
    return await generate_chat_reply(req.message, session_id=session_id, top_k=req.top_k)


@app.post("/sessions/reset")
async def clear_session(req: ResetSessionRequest):
    return {"session_id": req.session_id, "cleared": reset_session(req.session_id)}


@app.post("/admin/rebuild")
async def rebuild():
    store = build_vectorstore(force=True)
    return {"status": "ok", "rebuilt": store is not None, "vector_store_path": settings.vector_store_path}
