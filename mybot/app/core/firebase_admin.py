"""
ZeptAI — Optional Firebase Admin SDK initialisation.

Set FIREBASE_ADMIN_ENABLED=true in your .env to enable server-side
Firebase token verification.  When disabled (the default), the server
accepts sessions without a Firebase token so local development works
without a service-account key.
"""
from __future__ import annotations

import logging
import os

logger = logging.getLogger(__name__)

_app = None  # firebase_admin.App instance (or None if disabled)


def get_firebase_app():
    """Return the initialised firebase_admin.App, or None if disabled."""
    global _app
    if _app is not None:
        return _app

    enabled = os.getenv("FIREBASE_ADMIN_ENABLED", "false").lower() == "true"
    if not enabled:
        return None

    try:
        import firebase_admin
        from firebase_admin import credentials

        cred_path = os.getenv("GOOGLE_APPLICATION_CREDENTIALS", "")
        project_id = os.getenv("FIREBASE_PROJECT_ID", "")

        if cred_path and os.path.isfile(cred_path):
            cred = credentials.Certificate(cred_path)
        elif project_id:
            cred = credentials.ApplicationDefault()
        else:
            logger.warning(
                "FIREBASE_ADMIN_ENABLED=true but no credentials found. "
                "Set GOOGLE_APPLICATION_CREDENTIALS or FIREBASE_PROJECT_ID."
            )
            return None

        options = {"projectId": project_id} if project_id else {}
        _app = firebase_admin.initialize_app(cred, options)
        logger.info("Firebase Admin SDK initialised (project: %s)", project_id or "default")
        return _app

    except ImportError:
        logger.warning(
            "firebase-admin package not installed. "
            "Run: pip install firebase-admin"
        )
    except Exception as exc:  # noqa: BLE001
        logger.warning("Firebase Admin init failed: %s", exc)

    return None
