"""
Text cleaning utilities for normalizing patient input.
"""
import re
import unicodedata


def clean_text(text: str) -> str:
    """Normalize unicode, strip extra whitespace, remove control chars."""
    text = unicodedata.normalize("NFKC", text)
    text = re.sub(r"[\x00-\x1f\x7f]", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def normalize_for_embedding(text: str) -> str:
    """Lowercase and clean text for embedding lookup."""
    return clean_text(text).lower()


def truncate(text: str, max_chars: int = 4096) -> str:
    """Truncate text to a max character length."""
    if len(text) <= max_chars:
        return text
    return text[:max_chars] + "..."


def split_into_sentences(text: str) -> list[str]:
    """Simple sentence splitter."""
    sents = re.split(r"(?<=[.!?])\s+", text.strip())
    return [s for s in sents if s]
