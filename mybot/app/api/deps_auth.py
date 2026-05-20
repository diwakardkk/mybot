"""
ZeptAI — Optional Firebase token verification dependency.

Usage in a route:

    @router.post("/some-route")
    async def my_route(
        uid: str | None = Depends(get_optional_firebase_uid),
    ):
        ...

When FIREBASE_ADMIN_ENABLED=false (default), ``uid`` will be None and
the existing anonymous-session flow continues unchanged.
"""
from __future__ import annotations

import logging
from typing import Optional

from fastapi import Header, HTTPException, status

from app.core.firebase_admin import get_firebase_app

logger = logging.getLogger(__name__)


async def get_optional_firebase_uid(
    authorization: Optional[str] = Header(default=None),
) -> Optional[str]:
    """
    Extract the Firebase UID from a Bearer token if available.

    Returns None when:
      - FIREBASE_ADMIN_ENABLED is false
      - No Authorization header is present
      - Token is invalid (logs a warning, does NOT raise — keeps backward compat)
    """
    app = get_firebase_app()
    if app is None:
        return None

    if not authorization or not authorization.startswith("Bearer "):
        return None

    token = authorization.split(" ", 1)[1]
    try:
        from firebase_admin import auth as fb_auth  # type: ignore

        decoded = fb_auth.verify_id_token(token, app=app)
        return decoded.get("uid")
    except Exception as exc:  # noqa: BLE001
        logger.warning("Firebase token verification failed: %s", exc)
        return None


async def require_firebase_uid(
    authorization: Optional[str] = Header(default=None),
) -> str:
    """
    Like get_optional_firebase_uid but raises 401 if no valid token.
    Use this only on routes that REQUIRE Firebase auth.
    """
    uid = await get_optional_firebase_uid(authorization)
    if uid is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Valid Firebase ID token required.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return uid
