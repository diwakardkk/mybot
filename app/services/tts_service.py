"""
TTS Service — converts text to speech using OpenAI TTS API.
"""
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


async def synthesize_speech(text: str, voice: str | None = None) -> bytes:
    """Convert text to speech and return raw audio bytes (mp3)."""
    client = _get_client()
    selected_voice = voice or settings.openai_tts_voice
    try:
        response = await client.audio.speech.create(
            model=settings.openai_tts_model,
            voice=selected_voice,  # type: ignore[arg-type]
            input=text,
            response_format="mp3",
        )
        audio_bytes = response.content
        logger.info(f"TTS generated {len(audio_bytes)} bytes for text: {text[:60]}")
        return audio_bytes
    except Exception as e:
        logger.error(f"TTS error: {e}")
        raise
