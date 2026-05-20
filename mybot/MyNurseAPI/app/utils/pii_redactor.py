"""
PII redactor — removes or masks sensitive personal information before logging.
"""
import re


_PATTERNS = {
    "phone": r"\b(\+?\d[\d\s\-().]{7,}\d)\b",
    "email": r"[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}",
    "ssn": r"\b\d{3}[-\s]?\d{2}[-\s]?\d{4}\b",
    "dob": r"\b(0?[1-9]|[12]\d|3[01])[-/](0?[1-9]|1[0-2])[-/](\d{2,4})\b",
    "credit_card": r"\b(?:\d[ -]?){13,16}\b",
}

_REPLACEMENTS = {
    "phone": "[PHONE]",
    "email": "[EMAIL]",
    "ssn": "[SSN]",
    "dob": "[DOB]",
    "credit_card": "[CC]",
}


def redact_pii(text: str) -> str:
    """Replace PII patterns in text with placeholders."""
    for key, pattern in _PATTERNS.items():
        text = re.sub(pattern, _REPLACEMENTS[key], text)
    return text


def is_safe_to_log(text: str) -> bool:
    """Check whether text contains known PII patterns."""
    for pattern in _PATTERNS.values():
        if re.search(pattern, text):
            return False
    return True
