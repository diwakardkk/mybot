"""
Conversation turn repository — in-memory + SQLite persistence.
"""
from typing import List, Dict
from app.models.session import ConversationTurn
from app.core.logging import get_logger

logger = get_logger(__name__)
_turns: Dict[str, List[ConversationTurn]] = {}


def _persist_turn(conversation_id: str, turn: ConversationTurn):
    try:
        from app.db.database import SessionLocal, DBTurn
        db = SessionLocal()
        obj = DBTurn(
            conversation_id=conversation_id,
            turn_id=turn.turn_id,
            speaker=turn.speaker,
            text=turn.text,
            state=turn.state,
            timestamp=turn.timestamp,
        )
        db.add(obj)
        db.commit()
        db.close()
    except Exception as e:
        logger.warning(f"DB persist turn error: {e}")


def add_turn(conversation_id: str, turn: ConversationTurn) -> ConversationTurn:
    if conversation_id not in _turns:
        _turns[conversation_id] = []
    _turns[conversation_id].append(turn)
    _persist_turn(conversation_id, turn)
    return turn


def get_turns(conversation_id: str) -> List[ConversationTurn]:
    return _turns.get(conversation_id, [])


def get_turn_count(conversation_id: str) -> int:
    return len(_turns.get(conversation_id, []))


def clear_turns(conversation_id: str) -> None:
    _turns[conversation_id] = []
