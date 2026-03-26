from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime
from enum import Enum


class ConversationState(str, Enum):
    greeting = "greeting"
    start = "start"
    symptom = "symptom"
    history = "history"
    summary = "summary"
    emergency = "emergency"
    closed = "closed"


class ConversationTurn(BaseModel):
    turn_id: int
    speaker: str  # "patient" | "assistant"
    text: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    state: str
    extracted_fields: Dict[str, Any] = Field(default_factory=dict)


class PatientSession(BaseModel):
    conversation_id: str
    patient_name: Optional[str] = None
    language: str = "en"
    voice_mode: bool = False
    state: ConversationState = ConversationState.greeting
    turns: List[ConversationTurn] = Field(default_factory=list)
    questions_asked: List[str] = Field(default_factory=list)  # list of answered question IDs
    pending_question_id: Optional[str] = None  # question currently awaiting a valid answer
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    is_active: bool = True
