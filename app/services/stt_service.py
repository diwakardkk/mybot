"""
STT Service — transcribes audio using OpenAI Whisper API.
"""
import io
import os
from openai import AsyncOpenAI
from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)
_client: AsyncOpenAI | None = None


def _get_client() -> AsyncOpenAI:
    global _client
    if _client is None:
        _client = AsyncOpenAI(api_key=settings.openai_api_key)
    return _client


async def transcribe_audio(audio_bytes: bytes, filename: str = "audio.webm") -> str:
    """Send audio bytes to Whisper and return the transcript text."""
    client = _get_client()
    try:
        audio_file = io.BytesIO(audio_bytes)
        audio_file.name = filename
        response = await client.audio.transcriptions.create(
            model=settings.openai_stt_model,
            file=audio_file,
            response_format="text",
        )
        transcript = str(response).strip()
        logger.info(f"STT transcript ({len(transcript)} chars): {transcript[:80]}")
        return transcript
    except Exception as e:
        logger.error(f"STT error: {e}")
        raise


async def save_audio_file(audio_bytes: bytes, conversation_id: str, turn_id: int) -> str:
    """Save audio file and return its path."""
    os.makedirs(settings.audio_store_path, exist_ok=True)
    path = os.path.join(settings.audio_store_path, f"{conversation_id}_turn{turn_id}.webm")
    with open(path, "wb") as f:
        f.write(audio_bytes)
    return path
