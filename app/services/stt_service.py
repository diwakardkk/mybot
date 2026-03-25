"""
STT Service — transcribes audio using OpenAI Whisper API or local faster-whisper.
"""
import io
import os
import tempfile
from openai import AsyncOpenAI
from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)
_client: AsyncOpenAI | None = None
_local_whisper = None


def _get_client() -> AsyncOpenAI:
    global _client
    if _client is None:
        _client = AsyncOpenAI(api_key=settings.openai_api_key)
    return _client


async def transcribe_audio(audio_bytes: bytes, filename: str = "audio.webm") -> str:
    """
    Transcribe audio with the selected backend.
    - openai: uses remote Whisper API (default).
    - faster_whisper: uses local model for lower latency and cost.
    """
    backend = settings.stt_backend.lower()
    if backend == "faster_whisper":
        return await _transcribe_local(audio_bytes, filename)
    return await _transcribe_openai(audio_bytes, filename)


async def save_audio_file(audio_bytes: bytes, conversation_id: str, turn_id: int) -> str:
    """Save audio file and return its path."""
    os.makedirs(settings.audio_store_path, exist_ok=True)
    path = os.path.join(settings.audio_store_path, f"{conversation_id}_turn{turn_id}.webm")
    with open(path, "wb") as f:
        f.write(audio_bytes)
    return path


# ── Backends ──────────────────────────────────────────────────────────────────
async def _transcribe_openai(audio_bytes: bytes, filename: str) -> str:
    """Send audio bytes to OpenAI Whisper API and return text."""
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
        logger.info(f"[openai] STT transcript ({len(transcript)} chars): {transcript[:80]}")
        return transcript
    except Exception as e:
        logger.error(f"[openai] STT error: {e}")
        raise


async def _transcribe_local(audio_bytes: bytes, filename: str) -> str:
    """Use faster-whisper locally for transcription."""
    model = _get_local_model()
    suffix = os.path.splitext(filename or "audio")[1] or ".webm"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(audio_bytes)
        tmp_path = tmp.name
    try:
        segments, _ = model.transcribe(
            tmp_path,
            beam_size=1,
            vad_filter=True,
            language="en",
        )
        transcript = " ".join(seg.text.strip() for seg in segments).strip()
        logger.info(f"[faster_whisper] transcript ({len(transcript)} chars)")
        return transcript
    except Exception as e:
        logger.error(f"[faster_whisper] STT error: {e}")
        # Fallback to OpenAI if local fails
        return await _transcribe_openai(audio_bytes, filename)
    finally:
        try:
            os.remove(tmp_path)
        except OSError:
            pass


def _get_local_model():
    """Lazy-load faster-whisper model."""
    global _local_whisper
    if _local_whisper is not None:
        return _local_whisper
    try:
        from faster_whisper import WhisperModel
    except ImportError:
        logger.error("faster-whisper is not installed. Install it or set STT_BACKEND=openai.")
        raise

    _local_whisper = WhisperModel(
        settings.faster_whisper_model,
        device="cpu",
        compute_type=settings.faster_whisper_compute_type,
    )
    logger.info(
        f"Loaded faster-whisper model '{settings.faster_whisper_model}' "
        f"({settings.faster_whisper_compute_type})"
    )
    return _local_whisper
