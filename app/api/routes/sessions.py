"""
Sessions admin routes.
"""
from fastapi import APIRouter
from app.db import session_repo

router = APIRouter(prefix="/sessions", tags=["sessions"])


@router.get("/")
async def list_sessions():
    sessions = session_repo.list_sessions()
    return [
        {
            "conversation_id": s.conversation_id,
            "patient_name": s.patient_name,
            "state": s.state.value,
            "is_active": s.is_active,
            "questions_asked": s.questions_asked,
            "created_at": s.created_at.isoformat(),
        }
        for s in sessions
    ]


@router.delete("/{conversation_id}")
async def delete_session(conversation_id: str):
    deleted = session_repo.delete_session(conversation_id)
    return {"deleted": deleted, "conversation_id": conversation_id}
