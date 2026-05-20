"""
Report service — structured medical analysis + GPT narrative refinement.
Two entry points:
  generate_report_analysis(conversation_id)          — uses memory repo
  generate_report_analysis_from_transcript(transcript) — takes raw text (DB-resilient)
  refine_narrative(raw_text)                          — GPT polish pass
"""
import json
from openai import OpenAI
from app.core.config import settings
from app.core.logging import get_logger
from app.db import conversation_repo

logger = get_logger(__name__)
_client: OpenAI | None = None


def _get_client() -> OpenAI:
    global _client
    if _client is None:
        _client = OpenAI(api_key=settings.openai_api_key)
    return _client


def _build_transcript(turns: list) -> str:
    lines = []
    for t in turns:
        label = "Patient" if t.speaker == "patient" else "NurseBot"
        lines.append(f"[{label}]: {t.text}")
    return "\n".join(lines)


KEY_POINTS_PROMPT = """You are a clinical medical analyst. Analyze the following hospital intake conversation and extract structured medical insights.

CONVERSATION:
{transcript}

Return ONLY valid JSON with this exact schema:
{{
  "key_findings": ["list of 3-6 most important clinical findings as short bullets"],
  "risk_level": "low | medium | high | critical",
  "risk_justification": "one sentence justification for risk level",
  "chief_complaint_summary": "concise 1-sentence summary of the main complaint",
  "symptom_analysis": "2-3 sentence analysis of reported symptoms",
  "medication_concerns": "any drug interaction or medication concerns, or 'None identified'",
  "allergy_flags": "any critical allergy information, or 'None reported'",
  "clinical_recommendations": ["list of 3-5 specific clinical recommendations"],
  "urgency": "routine | urgent | emergency",
  "follow_up_suggested": true or false,
  "suggested_follow_up_days": 7 or 15 or 30 or null,
  "red_flags": ["list any red-flag symptoms, empty list if none"]
}}"""

REFINEMENT_PROMPT = """You are a senior clinical writer. Rewrite the following clinical summary in clear, professional medical language suitable for a doctor to read quickly. 
Keep ALL the same information — do not add or remove clinical facts. 
Make it concise, fluent, and use proper medical terminology where appropriate.
Return ONLY the refined text, no headers, no JSON.

RAW SUMMARY:
{raw}"""


def generate_report_analysis_from_transcript(transcript: str) -> dict:
    """Run structured analysis on a pre-built transcript string."""
    if not transcript.strip():
        return _empty_analysis()
    client = _get_client()
    if len(transcript) > 12000:
        transcript = _summarize_long_transcript(client, transcript)
    prompt = KEY_POINTS_PROMPT.format(transcript=transcript)
    try:
        resp = client.chat.completions.create(
            model=settings.openai_chat_model,
            messages=[
                {"role": "system", "content": "You are a clinical medical analyst. Return only valid JSON."},
                {"role": "user",   "content": prompt},
            ],
            response_format={"type": "json_object"},
            max_tokens=900,
            temperature=0.15,
        )
        raw = resp.choices[0].message.content or "{}"
        result = json.loads(raw)
        logger.info(f"Analysis done: risk={result.get('risk_level')}")
        return result
    except Exception as e:
        logger.error(f"Analysis error: {e}")
        return _empty_analysis()


def generate_report_analysis(conversation_id: str) -> dict:
    """Legacy entry-point — loads turns from memory repo."""
    turns = conversation_repo.get_turns(conversation_id)
    transcript = _build_transcript(turns)
    return generate_report_analysis_from_transcript(transcript)


def refine_narrative(raw_text: str) -> str:
    """GPT polish pass — same content, better medical language."""
    if not raw_text.strip():
        return raw_text
    client = _get_client()
    try:
        resp = client.chat.completions.create(
            model=settings.openai_chat_model,
            messages=[
                {"role": "system", "content": "You are a senior clinical writer. Return only the refined text."},
                {"role": "user",   "content": REFINEMENT_PROMPT.format(raw=raw_text[:3000])},
            ],
            max_tokens=500,
            temperature=0.3,
        )
        refined = (resp.choices[0].message.content or raw_text).strip()
        logger.info(f"GPT narrative refinement done ({len(refined)} chars)")
        return refined
    except Exception as e:
        logger.error(f"Refinement error: {e}")
        return raw_text  # fall back to raw


def _summarize_long_transcript(client, transcript: str) -> str:
    resp = client.chat.completions.create(
        model=settings.openai_chat_model,
        messages=[
            {"role": "system", "content": "Summarize this medical intake conversation preserving all symptoms, medications, allergies, and key statements."},
            {"role": "user",   "content": transcript[:10000]},
        ],
        max_tokens=1200,
    )
    return resp.choices[0].message.content or transcript[:4000]


def _empty_analysis() -> dict:
    return {
        "key_findings": ["Insufficient conversation data — complete the intake first"],
        "risk_level": "unknown",
        "risk_justification": "Not enough data to assess",
        "chief_complaint_summary": "Not established",
        "symptom_analysis": "No symptoms recorded yet",
        "medication_concerns": "None identified",
        "allergy_flags": "None reported",
        "clinical_recommendations": ["Complete the intake conversation first"],
        "urgency": "routine",
        "follow_up_suggested": False,
        "suggested_follow_up_days": None,
        "red_flags": [],
    }


def get_conversation_audio_script(conversation_id: str) -> str:
    turns = conversation_repo.get_turns(conversation_id)
    parts = []
    for t in turns:
        label = "Patient said: " if t.speaker == "patient" else "Nurse bot said: "
        parts.append(label + t.text)
    return ". ".join(parts)
