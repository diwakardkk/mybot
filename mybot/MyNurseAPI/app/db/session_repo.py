"""
Session repository — in-memory + SQLite persistence.
"""
from typing import Dict, Optional
from app.models.session import PatientSession
import uuid
from datetime import datetime
from app.core.logging import get_logger

logger = get_logger(__name__)
_sessions: Dict[str, PatientSession] = {}


def _persist(session: PatientSession):
    try:
        from app.db.database import SessionLocal, DBSession
        db = SessionLocal()
        obj = db.query(DBSession).filter_by(conversation_id=session.conversation_id).first()
        if obj:
            obj.state          = session.state.value
            obj.questions_asked= session.questions_asked
            obj.is_active      = session.is_active
            obj.updated_at     = datetime.utcnow()
        else:
            obj = DBSession(
                conversation_id = session.conversation_id,
                patient_name    = session.patient_name,
                language        = session.language,
                voice_mode      = session.voice_mode,
                state           = session.state.value,
                questions_asked = session.questions_asked,
                is_active       = session.is_active,
                created_at      = session.created_at,
                updated_at      = datetime.utcnow(),
            )
            db.add(obj)
        db.commit()
        db.close()
    except Exception as e:
        logger.warning(f"DB persist session error: {e}")


def create_session(patient_name=None, language="en", voice_mode=False) -> PatientSession:
    conversation_id = str(uuid.uuid4())
    session = PatientSession(
        conversation_id=conversation_id,
        patient_name=patient_name,
        language=language,
        voice_mode=voice_mode,
    )
    _sessions[conversation_id] = session
    _persist(session)
    return session


def get_session(conversation_id: str) -> Optional[PatientSession]:
    return _sessions.get(conversation_id)


def update_session(session: PatientSession) -> PatientSession:
    session.updated_at = datetime.utcnow()
    _sessions[session.conversation_id] = session
    _persist(session)
    return session


def close_session(conversation_id: str) -> bool:
    if conversation_id in _sessions:
        _sessions[conversation_id].is_active = False
        _persist(_sessions[conversation_id])
        return True
    return False


def list_sessions() -> list:
    return list(_sessions.values())


def delete_session(conversation_id: str) -> bool:
    return _sessions.pop(conversation_id, None) is not None
