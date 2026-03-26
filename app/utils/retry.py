"""
Retry decorator with exponential backoff using tenacity.
"""
from tenacity import (
    retry,
    stop_after_attempt,
    wait_exponential,
    retry_if_exception_type,
)
import httpx
import openai


def openai_retry(func):
    """Decorator: retry OpenAI calls up to 3 times with exponential backoff."""
    return retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=2, max=10),
        retry=retry_if_exception_type(
            (openai.APIConnectionError, openai.RateLimitError, openai.APIStatusError)
        ),
        reraise=True,
    )(func)


def http_retry(func):
    """Decorator: retry httpx calls up to 3 times."""
    return retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=8),
        retry=retry_if_exception_type((httpx.ConnectError, httpx.TimeoutException)),
        reraise=True,
    )(func)
