"""
STT route — accepts audio file upload, returns transcript.
"""
from fastapi import APIRouter, UploadFile, File, HTTPException
from app.services.stt_service import transcribe_audio
from app.core.logging import get_logger

router = APIRouter(prefix="/stt", tags=["speech-to-text"])
logger = get_logger(__name__)

ALLOWED_CONTENT_TYPES = {
    "audio/webm", "audio/wav", "audio/mp3", "audio/mpeg",
    "audio/ogg", "audio/m4a", "audio/mp4", "application/octet-stream",
}


@router.post("/transcribe")
async def transcribe(audio: UploadFile = File(...)):
    """Upload audio file and receive transcribed text."""
    if audio.content_type and audio.content_type not in ALLOWED_CONTENT_TYPES:
        logger.warning(f"Unexpected content type: {audio.content_type} — attempting anyway")
    audio_bytes = await audio.read()
    if len(audio_bytes) < 100:
        raise HTTPException(status_code=400, detail="Audio file is too small or empty")
    transcript = await transcribe_audio(audio_bytes, filename=audio.filename or "audio.webm")
    return {"transcript": transcript, "filename": audio.filename}
