from __future__ import annotations
"""
TTS route — converts text to speech and returns audio bytes.
"""
from fastapi import APIRouter
from fastapi.responses import Response
from pydantic import BaseModel
from app.services.tts_service import synthesize_speech
from app.core.logging import get_logger

router = APIRouter(prefix="/tts", tags=["text-to-speech"])
logger = get_logger(__name__)


from typing import Optional

class TTSRequest(BaseModel):
    text: str
    voice: Optional[str] = None
    backend: Optional[str] = None


@router.post("/speak")
async def speak(req: TTSRequest):
    """Convert text to speech and stream mp3 audio bytes."""
    audio_bytes, media_type = await synthesize_speech(
        req.text,
        voice=req.voice,
        backend=req.backend,
    )
    return Response(content=audio_bytes, media_type=media_type)
