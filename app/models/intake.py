from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime


class IntakeData(BaseModel):
    conversation_id: str
    patient_name: Optional[str] = None
    age: Optional[str] = None
    gender: Optional[str] = None
    chief_complaint: Optional[str] = None
    duration: Optional[str] = None
    associated_symptoms: List[str] = Field(default_factory=list)
    medications: List[str] = Field(default_factory=list)
    allergies: List[str] = Field(default_factory=list)
    past_illnesses: List[str] = Field(default_factory=list)
    risk_flags: List[str] = Field(default_factory=list)
    severity_score: Optional[float] = None
    is_emergency: bool = False
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
