"""
FastAPI dependency injection — provides validated session to route handlers.
"""
from fastapi import HTTPException, Header
from app.db import session_repo
from app.models.session import PatientSession
from typing import Optional


async def get_active_session(x_conversation_id: str = Header(...)) -> PatientSession:
    session = session_repo.get_session(x_conversation_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if not session.is_active:
        raise HTTPException(status_code=410, detail="Session is closed")
    return session
