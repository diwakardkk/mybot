from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
from enum import Enum


class MessageRole(str, Enum):
    user = "user"
    assistant = "assistant"
    system = "system"


class ChatMessage(BaseModel):
    role: MessageRole
    content: str
    timestamp: Optional[datetime] = Field(default_factory=datetime.utcnow)


class ChatRequest(BaseModel):
    conversation_id: str
    message: str
    voice_mode: bool = False


class ChatResponse(BaseModel):
    conversation_id: str
    turn_id: int
    response: str
    state: str
    next_question: Optional[str] = None
    is_emergency: bool = False
    audio_url: Optional[str] = None


class StartSessionRequest(BaseModel):
    patient_name: Optional[str] = None
    language: str = "en"
    voice_mode: bool = False


class StartSessionResponse(BaseModel):
    conversation_id: str
    greeting: str
    state: str
    voice_mode: bool
