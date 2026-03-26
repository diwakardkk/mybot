"""
Refinement service — uses OpenAI to make draft responses sound natural.
"""
from openai import AsyncOpenAI
from app.core.config import settings
from app.core.prompts import REFINEMENT_PROMPT, SYSTEM_PROMPT
from app.core.logging import get_logger

logger = get_logger(__name__)
_client: AsyncOpenAI | None = None


def _get_client() -> AsyncOpenAI:
    global _client
    if _client is None:
        _client = AsyncOpenAI(api_key=settings.openai_api_key)
    return _client


async def refine_response(draft: str, patient_message: str, conversation_history: list[dict] | None = None) -> str:
    """Use GPT to refine a draft response so it sounds empathetic and natural."""
    client = _get_client()
    prompt = REFINEMENT_PROMPT.format(draft=draft, patient_message=patient_message)

    messages = [{"role": "system", "content": SYSTEM_PROMPT}]
    if conversation_history:
        messages.extend(conversation_history[-6:])  # last 3 turns for context
    messages.append({"role": "user", "content": prompt})

    try:
        resp = await client.chat.completions.create(
            model=settings.openai_chat_model,
            messages=messages,  # type: ignore[arg-type]
            max_tokens=256,
            temperature=0.7,
        )
        refined = resp.choices[0].message.content or draft
        logger.info(f"Refined response: {refined[:80]}")
        return refined.strip()
    except Exception as e:
        logger.error(f"Refinement error: {e}. Using draft.")
        return draft
