from __future__ import annotations
"""
TTS Service — converts text to speech using OpenAI TTS API or local Piper CLI.
"""
import os
import subprocess
import tempfile
from typing import Optional, Tuple

import httpx
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


async def synthesize_speech(
    text: str,
    voice: Optional[str] = None,
    backend: Optional[str] = None,
) -> Tuple[bytes, str]:
    """
    Convert text to speech using the selected backend.
    Returns (audio_bytes, media_type).
    """
    chosen = (backend or settings.tts_backend).lower()
    if chosen == "piper":
        return _synthesize_piper(text), "audio/wav"
    elif chosen == "elevenlabs":
        return await _synthesize_elevenlabs(text, voice or settings.elevenlabs_voice_id), "audio/mpeg"
    return await _synthesize_openai(text, voice or settings.openai_tts_voice), "audio/mpeg"


# ── Backends ──────────────────────────────────────────────────────────────────
async def _synthesize_openai(text: str, voice: str) -> bytes:
    client = _get_client()
    try:
        response = await client.audio.speech.create(
            model=settings.openai_tts_model,
            voice=voice,  # type: ignore[arg-type]
            input=text,
            response_format="mp3",
        )
        audio_bytes = response.content
        logger.info(f"[openai] TTS generated {len(audio_bytes)} bytes for text: {text[:60]}")
        return audio_bytes
    except Exception as e:
        logger.error(f"[openai] TTS error: {e}")
        raise


async def _synthesize_elevenlabs(text: str, voice_id: str) -> bytes:
    if not settings.elevenlabs_api_key:
        logger.warning("[elevenlabs] API key not found in settings, falling back to OpenAI.")
        return await _synthesize_openai(text, settings.openai_tts_voice)
    
    url = f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}"
    headers = {
        "Accept": "audio/mpeg",
        "Content-Type": "application/json",
        "xi-api-key": settings.elevenlabs_api_key
    }
    data = {
        "text": text,
        "model_id": "eleven_turbo_v2",
        "voice_settings": {
            "stability": 0.5,
            "similarity_boost": 0.75
        }
    }
    async with httpx.AsyncClient() as client:
        try:
            response = await client.post(url, json=data, headers=headers, timeout=30.0)
            if response.status_code != 200:
                logger.error(f"[elevenlabs] API error: {response.text}")
                logger.warning("[elevenlabs] Falling back to OpenAI.")
                return await _synthesize_openai(text, settings.openai_tts_voice)
            
            audio_bytes = response.content
            logger.info(f"[elevenlabs] TTS generated {len(audio_bytes)} bytes for text: {text[:60]}")
            return audio_bytes
        except Exception as e:
            logger.error(f"[elevenlabs] request error: {e}")
            logger.warning("[elevenlabs] Falling back to OpenAI.")
            return await _synthesize_openai(text, settings.openai_tts_voice)


def _synthesize_piper(text: str) -> bytes:
    """
    Call local Piper CLI.
    Requirements:
      - piper binary available (settings.piper_binary)
      - model file downloaded (settings.piper_model_path)
    """
    if not os.path.isfile(settings.piper_model_path):
        msg = f"Piper model not found at {settings.piper_model_path}"
        logger.error(msg)
        raise FileNotFoundError(msg)

    with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as tmp_out:
        out_path = tmp_out.name

    cmd = [
        settings.piper_binary,
        "--model", settings.piper_model_path,
        "--output_file", out_path,
        "--sentence_silence", str(settings.piper_sentence_silence),
    ]

    try:
        result = subprocess.run(
            cmd,
            input=text.encode("utf-8"),
            capture_output=True,
            check=True,
        )
        with open(out_path, "rb") as f:
            audio_bytes = f.read()
        logger.info(f"[piper] TTS generated {len(audio_bytes)} bytes")
        return audio_bytes
    except FileNotFoundError:
        msg = "Piper binary not found. Install Piper or set TTS_BACKEND=openai."
        logger.error(msg)
        raise
    except subprocess.CalledProcessError as e:
        logger.error(f"[piper] TTS error: {e.stderr.decode('utf-8', errors='ignore')}")
        raise
    finally:
        try:
            os.remove(out_path)
        except OSError:
            pass
