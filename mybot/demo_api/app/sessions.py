from collections import defaultdict
from typing import Dict, List
from uuid import uuid4

from .config import settings
from .models import MessageItem


_session_messages: Dict[str, List[MessageItem]] = defaultdict(list)


def ensure_session(session_id: str | None) -> str:
    if session_id and session_id.strip():
        return session_id.strip()
    return str(uuid4())


def get_history(session_id: str) -> list[MessageItem]:
    history = _session_messages.get(session_id, [])
    limit = settings.max_history_messages
    return history[-limit:] if limit > 0 else history


def append_message(session_id: str, role: str, content: str) -> None:
    _session_messages[session_id].append(MessageItem(role=role, content=content))


def reset_session(session_id: str) -> bool:
    return _session_messages.pop(session_id, None) is not None
