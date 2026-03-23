"""
Conversation service — the main orchestration engine.
Manages state machine, mandatory question flow, and response generation.
"""
import json
import os
from typing import Optional
from datetime import datetime

from app.core.prompts import GREETING_MESSAGE, CLOSING_MESSAGE, EMERGENCY_KEYWORDS
from app.core.logging import get_logger
from app.models.session import PatientSession, ConversationState, ConversationTurn
from app.services.retrieval_service import get_context_for_query, has_emergency_keyword
from app.services.refinement_service import refine_response
from app.db import session_repo, conversation_repo
from app.core.config import settings

logger = get_logger(__name__)

# Load questions from seed file
def _load_questions() -> list[dict]:
    path = settings.seed_questions_path
    if os.path.exists(path):
        with open(path, "r") as f:
            return json.load(f).get("questions", [])
    return []

QUESTIONS = _load_questions()
STAGE_ORDER = ["start", "symptom", "history", "summary"]

def _get_next_question(session: PatientSession) -> Optional[dict]:
    """Return the next unanswered required question based on current state."""
    current_stage = session.state.value
    for q in QUESTIONS:
        if q["id"] not in session.questions_asked:
            q_stage = q["stage"]
            # Allow question if its stage matches or is prior to current state
            if q_stage == current_stage or (
                STAGE_ORDER.index(q_stage) <= STAGE_ORDER.index(current_stage)
                if q_stage in STAGE_ORDER and current_stage in STAGE_ORDER else False
            ):
                return q
    # Also check if any question from earlier stages was missed
    for q in QUESTIONS:
        if q["id"] not in session.questions_asked:
            return q
    return None


def _advance_state(session: PatientSession) -> ConversationState:
    """Advance conversation state based on questions asked."""
    asked = set(session.questions_asked)
    asked_stages = {q["stage"] for q in QUESTIONS if q["id"] in asked}

    if "summary" in asked_stages:
        return ConversationState.closed
    elif "history" in asked_stages:
        return ConversationState.summary
    elif "symptom" in asked_stages:
        return ConversationState.history
    elif "start" in asked_stages:
        return ConversationState.symptom
    return ConversationState.start


async def process_message(session: PatientSession, user_message: str) -> dict:
    """Main message handler. Returns response dict with text, state, and flags."""
    turn_id = conversation_repo.get_turn_count(session.conversation_id) + 1

    # ── Emergency check ────────────────────────────────────────────────────────
    if has_emergency_keyword(user_message):
        session.state = ConversationState.emergency
        emergency_text = (
            "⚠️ ALERT: I've detected potentially serious symptoms. "
            "Please stay calm — I'm flagging this for immediate medical attention. "
            "A nurse or doctor will be with you right away."
        )
        _record_turn(session, turn_id, user_message, emergency_text)
        return {
            "response": emergency_text,
            "state": session.state.value,
            "is_emergency": True,
            "turn_id": turn_id,
        }

    # ── Store patient turn ─────────────────────────────────────────────────────
    patient_turn = ConversationTurn(
        turn_id=turn_id,
        speaker="patient",
        text=user_message,
        state=session.state.value,
        timestamp=datetime.utcnow(),
    )
    conversation_repo.add_turn(session.conversation_id, patient_turn)

    # ── Retrieve relevant knowledge ────────────────────────────────────────────
    context = get_context_for_query(user_message)

    # ── Determine next question ────────────────────────────────────────────────
    next_q = _get_next_question(session)

    if next_q:
        q_text = next_q["text"]
        session.questions_asked.append(next_q["id"])
        session.state = _advance_state(session)
        draft = f"Thank you for sharing that. {q_text}"
    else:
        # All questions answered — acknowledge and move to closing
        session.state = ConversationState.closed
        draft = CLOSING_MESSAGE

    # ── Build conversation history for refinement ──────────────────────────────
    history = [
        {"role": "user" if t.speaker == "patient" else "assistant", "content": t.text}
        for t in conversation_repo.get_turns(session.conversation_id)[-8:]
    ]

    # ── Refine with OpenAI ─────────────────────────────────────────────────────
    refined = await refine_response(draft, user_message, history)

    # ── Store assistant turn ───────────────────────────────────────────────────
    _record_turn(session, turn_id, user_message, refined)
    session_repo.update_session(session)

    return {
        "response": refined,
        "state": session.state.value,
        "is_emergency": False,
        "turn_id": turn_id,
        "next_question": next_q["id"] if next_q else None,
        "context_used": bool(context),
    }


def _record_turn(session: PatientSession, turn_id: int, user_text: str, bot_text: str):
    bot_turn = ConversationTurn(
        turn_id=turn_id,
        speaker="assistant",
        text=bot_text,
        state=session.state.value,
        timestamp=datetime.utcnow(),
    )
    conversation_repo.add_turn(session.conversation_id, bot_turn)
