"""
Chat routes — start session, send message, get summary.
"""
from fastapi import APIRouter, Depends, HTTPException
from app.models.chat import (
    StartSessionRequest, StartSessionResponse,
    ChatRequest, ChatResponse,
)
from app.models.session import PatientSession
from app.services import conversation_service, summary_service
from app.db import session_repo
from app.api.deps import get_active_session
from app.core.prompts import GREETING_MESSAGE
from app.core.logging import get_logger

router = APIRouter(prefix="/chat", tags=["chat"])
logger = get_logger(__name__)


@router.post("/start", response_model=StartSessionResponse)
async def start_session(req: StartSessionRequest):
    """Create a new patient intake session."""
    session = session_repo.create_session(
        patient_name=req.patient_name,
        language=req.language,
        voice_mode=req.voice_mode,
    )
    greeting = GREETING_MESSAGE
    if req.patient_name:
        greeting = f"Hello {req.patient_name}! " + GREETING_MESSAGE.replace("Hello! ", "")
    logger.info(f"Session started: {session.conversation_id}")
    return StartSessionResponse(
        conversation_id=session.conversation_id,
        greeting=greeting,
        state=session.state.value,
        voice_mode=req.voice_mode,
    )


@router.post("/message", response_model=ChatResponse)
async def send_message(
    req: ChatRequest,
    session: PatientSession = Depends(get_active_session),
):
    """Send a text message and receive the bot's response."""
    result = await conversation_service.process_message(session, req.message)
    return ChatResponse(
        conversation_id=session.conversation_id,
        turn_id=result["turn_id"],
        response=result["response"],
        state=result["state"],
        next_question=result.get("next_question"),
        is_emergency=result.get("is_emergency", False),
    )


@router.get("/summary/{conversation_id}")
async def get_summary(conversation_id: str):
    """Get the structured patient summary for a session."""
    session = session_repo.get_session(conversation_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    summary = await summary_service.generate_summary(session)
    return summary.model_dump()


@router.get("/history/{conversation_id}")
async def get_history(conversation_id: str):
    """Get the full conversation history."""
    from app.db import conversation_repo
    session = session_repo.get_session(conversation_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    turns = conversation_repo.get_turns(conversation_id)
    return {"conversation_id": conversation_id, "turns": [t.model_dump() for t in turns]}
