"""
Conversation service — the main orchestration engine.
Manages state machine, mandatory question flow, and response generation.
Validates patient answers before advancing to the next question — repeats
the same question if the response is unclear, a typo, or off-topic.
"""
import json
import os
from typing import Optional
from datetime import datetime

from openai import AsyncOpenAI
from app.core.prompts import (
    GREETING_MESSAGE, CLOSING_MESSAGE, EMERGENCY_KEYWORDS,
    VALIDATION_PROMPT, REFINEMENT_PROMPT, SYSTEM_PROMPT
)
from app.core.logging import get_logger
from app.models.session import PatientSession, ConversationState, ConversationTurn
from app.services.retrieval_service import get_context_for_query, has_emergency_keyword
from app.services.refinement_service import refine_response
from app.db import session_repo, conversation_repo
from app.core.config import settings

logger = get_logger(__name__)

_client: AsyncOpenAI | None = None

def _get_client() -> AsyncOpenAI:
    global _client
    if _client is None:
        _client = AsyncOpenAI(api_key=settings.openai_api_key)
    return _client


# Load questions from seed file
def _load_questions() -> list[dict]:
    path = settings.seed_questions_path
    if os.path.exists(path):
        with open(path, "r") as f:
            return json.load(f).get("questions", [])
    return []

QUESTIONS = _load_questions()
STAGE_ORDER = ["start", "symptom", "history", "summary"]


def _get_question_by_id(qid: str) -> Optional[dict]:
    for q in QUESTIONS:
        if q["id"] == qid:
            return q
    return None


def _get_next_question(session: PatientSession) -> Optional[dict]:
    """Return the next unanswered required question based on current state."""
    current_stage = session.state.value
    for q in QUESTIONS:
        if q["id"] not in session.questions_asked and q["id"] != session.pending_question_id:
            q_stage = q["stage"]
            if q_stage == current_stage or (
                STAGE_ORDER.index(q_stage) <= STAGE_ORDER.index(current_stage)
                if q_stage in STAGE_ORDER and current_stage in STAGE_ORDER else False
            ):
                return q
    # Also check if any question from earlier stages was missed
    for q in QUESTIONS:
        if q["id"] not in session.questions_asked and q["id"] != session.pending_question_id:
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


async def _validate_answer(question_text: str, patient_response: str) -> bool:
    """
    Use GPT to check if the patient's response is a meaningful answer to the question.
    Returns True if valid, False if the response is gibberish/off-topic.
    """
    client = _get_client()
    prompt = VALIDATION_PROMPT.format(
        question=question_text,
        response=patient_response
    )
    try:
        resp = await client.chat.completions.create(
            model=settings.openai_chat_model,
            messages=[
                {"role": "system", "content": "You are a medical intake quality reviewer."},
                {"role": "user", "content": prompt},
            ],
            max_tokens=5,
            temperature=0,
        )
        verdict = (resp.choices[0].message.content or "NO").strip().upper()
        logger.info(f"Answer validation for '{question_text[:40]}': {verdict}")
        return verdict.startswith("YES")
    except Exception as e:
        logger.error(f"Validation error: {e}. Defaulting to valid.")
        return True  # fail-open: assume valid if GPT fails


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

    # ── Build conversation history for refinement ──────────────────────────────
    history = [
        {"role": "user" if t.speaker == "patient" else "assistant", "content": t.text}
        for t in conversation_repo.get_turns(session.conversation_id)[-8:]
    ]

    # ── Check if there's a pending question (one the bot asked but didn't get a valid answer for) ──
    pending_q = _get_question_by_id(session.pending_question_id) if session.pending_question_id else None

    if pending_q:
        # Validate whether the patient's message answers the pending question
        answer_is_valid = await _validate_answer(pending_q["text"], user_message)

        if answer_is_valid:
            # Mark the pending question as answered and clear it
            session.questions_asked.append(pending_q["id"])
            session.pending_question_id = None
            session.state = _advance_state(session)
            logger.info(f"Question {pending_q['id']} answered. Moving forward.")

            # Now pick the NEXT question
            next_q = _get_next_question(session)
            if next_q:
                session.pending_question_id = next_q["id"]
                draft = f"Thank you. {next_q['text']}"
                question_asked_id = next_q["id"]
            else:
                session.state = ConversationState.closed
                draft = CLOSING_MESSAGE
                question_asked_id = None
        else:
            # Invalid/garbled response — repeat the SAME pending question
            logger.info(f"Response unclear. Repeating question {pending_q['id']}.")
            draft = (
                f"I'm sorry, I didn't quite catch a clear answer. "
                f"Could you please answer: {pending_q['text']}"
            )
            question_asked_id = None  # don't advance progress bar
    else:
        # No pending question — first message or just starting
        next_q = _get_next_question(session)
        if next_q:
            session.pending_question_id = next_q["id"]
            draft = f"Thank you for sharing that. {next_q['text']}"
            question_asked_id = next_q["id"]
        else:
            session.state = ConversationState.closed
            draft = CLOSING_MESSAGE
            question_asked_id = None

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
        "next_question": question_asked_id,
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
