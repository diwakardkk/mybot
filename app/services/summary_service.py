"""
Summary service — builds the final patient intake report.
"""
from app.services.extraction_service import extract_intake_data
from app.models.summary import PatientSummary
from app.db import conversation_repo
from app.core.logging import get_logger

logger = get_logger(__name__)


async def generate_summary(session) -> PatientSummary:
    """Extract structured data and build a human-readable summary."""
    turns = conversation_repo.get_turns(session.conversation_id)
    intake = await extract_intake_data(session.conversation_id, turns)

    symptoms_str = ", ".join(intake.associated_symptoms) if intake.associated_symptoms else "None reported"
    meds_str = ", ".join(intake.medications) if intake.medications else "None reported"
    allergies_str = ", ".join(intake.allergies) if intake.allergies else "None reported"
    flags_str = ", ".join(intake.risk_flags) if intake.risk_flags else "None"

    summary_text = (
        f"Patient presents with: {intake.chief_complaint or 'not specified'}. "
        f"Duration: {intake.duration or 'unknown'}. "
        f"Associated symptoms: {symptoms_str}. "
        f"Medications: {meds_str}. "
        f"Allergies: {allergies_str}. "
        f"Risk flags: {flags_str}."
    )

    return PatientSummary(
        conversation_id=session.conversation_id,
        patient_name=session.patient_name,
        chief_complaint=intake.chief_complaint,
        duration=intake.duration,
        symptoms_summary=symptoms_str,
        medications=meds_str,
        allergies=allergies_str,
        risk_flags=flags_str,
        summary_text=summary_text,
        is_emergency=intake.is_emergency,
        questions_completed=len(session.questions_asked),
        total_turns=len(turns),
    )
