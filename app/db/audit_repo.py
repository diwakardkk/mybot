"""
Audit log repository — records every significant event for compliance.
"""
from typing import List, Dict, Any
from datetime import datetime


_audit_log: List[Dict[str, Any]] = []


def log_event(event_type: str, conversation_id: str, details: Dict[str, Any] | None = None) -> None:
    _audit_log.append({
        "timestamp": datetime.utcnow().isoformat(),
        "event_type": event_type,
        "conversation_id": conversation_id,
        "details": details or {},
    })


def get_audit_log(conversation_id: str | None = None) -> List[Dict[str, Any]]:
    if conversation_id:
        return [e for e in _audit_log if e["conversation_id"] == conversation_id]
    return _audit_log
