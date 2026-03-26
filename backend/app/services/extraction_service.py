"""
Extraction service — uses OpenAI Structured Outputs to extract patient data as JSON.
Extracts: name, age, gender, chief_complaint, duration, symptoms,
          medications, allergies, risk_flags, severity, summary.
Two entry points:
  extract_intake_data(conversation_id, turns)          — original, takes ConversationTurn objects
  extract_intake_data_from_transcript(conversation_id, turns) — DB-resilient, returns raw dict
"""
import json
from openai import AsyncOpenAI
from app.core.config import settings
from app.core.logging import get_logger
from app.models.intake import IntakeData
from datetime import datetime

logger = get_logger(__name__)
_client: AsyncOpenAI | None = None


def _get_client() -> AsyncOpenAI:
    global _client
    if _client is None:
        _client = AsyncOpenAI(api_key=settings.openai_api_key)
    return _client


EXTRACTION_PROMPT = """Extract structured medical intake information from the following conversation.
Return ONLY valid JSON matching the schema exactly. Use null for unknown values.

Conversation:
{conversation}

Schema to fill:
{{
  "patient_name": "string or null - full name as stated by patient",
  "age": "string or null - age as stated e.g. '35' or '35 years'",
  "gender": "string or null - Male/Female/Other as stated",
  "chief_complaint": "string or null",
  "duration": "string or null",
  "associated_symptoms": ["list of strings"],
  "medications": ["list of strings"],
  "allergies": ["list of strings"],
  "past_illnesses": ["list of strings"],
  "risk_flags": ["list of strings - emergency symptoms only"],
  "severity_score": null or number 1-10,
  "summary_text": "2-3 sentence clinical summary"
}}"""


def _build_conversation_text(turns) -> str:
    lines = []
    for t in turns:
        speaker = "Patient" if t.speaker == "patient" else "Assistant"
        lines.append(f"{speaker}: {t.text}")
    return "\n".join(lines)


async def extract_intake_data(conversation_id: str, turns: list) -> IntakeData:
    """Extract structured patient intake data — returns IntakeData pydantic model."""
    client = _get_client()
    conversation_text = _build_conversation_text(turns)
    prompt = EXTRACTION_PROMPT.format(conversation=conversation_text)
    try:
        resp = await client.chat.completions.create(
            model=settings.openai_chat_model,
            messages=[
                {"role": "system", "content": "You are a medical data extractor. Return only valid JSON."},
                {"role": "user",   "content": prompt},
            ],
            response_format={"type": "json_object"},
            max_tokens=600,
            temperature=0.1,
        )
        raw  = resp.choices[0].message.content or "{}"
        data = json.loads(raw)
        logger.info(f"Extracted data for {conversation_id}: name={data.get('patient_name')}, age={data.get('age')}")
        return IntakeData(
            conversation_id=conversation_id,
            patient_name=data.get("patient_name"),
            age=data.get("age"),
            gender=data.get("gender"),
            chief_complaint=data.get("chief_complaint"),
            duration=data.get("duration"),
            associated_symptoms=data.get("associated_symptoms", []),
            medications=data.get("medications", []),
            allergies=data.get("allergies", []),
            past_illnesses=data.get("past_illnesses", []),
            risk_flags=data.get("risk_flags", []),
            severity_score=data.get("severity_score"),
            is_emergency=bool(data.get("risk_flags")),
            updated_at=datetime.utcnow(),
        )
    except Exception as e:
        logger.error(f"Extraction error: {e}")
        return IntakeData(conversation_id=conversation_id)


async def extract_intake_data_from_transcript(conversation_id: str, turns) -> dict:
    """DB-resilient version — returns a plain dict (works with DB ORM rows too)."""
    client = _get_client()
    conversation_text = _build_conversation_text(turns)
    if not conversation_text.strip():
        return {}
    prompt = EXTRACTION_PROMPT.format(conversation=conversation_text)
    try:
        resp = await client.chat.completions.create(
            model=settings.openai_chat_model,
            messages=[
                {"role": "system", "content": "You are a medical data extractor. Return only valid JSON."},
                {"role": "user",   "content": prompt},
            ],
            response_format={"type": "json_object"},
            max_tokens=600,
            temperature=0.1,
        )
        raw  = resp.choices[0].message.content or "{}"
        data = json.loads(raw)
        logger.info(f"Extracted (dict) for {conversation_id}: name={data.get('patient_name')}, age={data.get('age')}")
        return data
    except Exception as e:
        logger.error(f"Extraction (dict) error: {e}")
        return {}
