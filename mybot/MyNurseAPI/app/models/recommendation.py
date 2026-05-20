from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class RecommendationInput(BaseModel):
    conversation_id: str
    doctor_notes: Optional[str] = None
    follow_up_days: Optional[int] = None   # 7, 15, 30
    need_prescription: bool = False
    refer_specialist: bool = False
    lab_tests: bool = False
    diet_advice: bool = False
    exercise_advice: bool = False
    follow_up_date: Optional[str] = None   # YYYY-MM-DD


class RecommendationResponse(RecommendationInput):
    saved_at: Optional[datetime] = None
