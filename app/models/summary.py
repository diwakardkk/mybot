from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime


class PatientSummary(BaseModel):
    conversation_id: str
    patient_name: Optional[str] = None
    chief_complaint: Optional[str] = None
    duration: Optional[str] = None
    symptoms_summary: Optional[str] = None
    medications: Optional[str] = None
    allergies: Optional[str] = None
    risk_flags: Optional[str] = None
    summary_text: str = ""
    is_emergency: bool = False
    created_at: datetime = Field(default_factory=datetime.utcnow)
    questions_completed: int = 0
    total_turns: int = 0
