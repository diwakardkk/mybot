/**
 * ZeptAI — Firebase Configuration
 * ─────────────────────────────────────────────────────────────
 * Replace ALL placeholder values below with your actual Firebase
 * project credentials before deploying.
 *
 * Get them from: https://console.firebase.google.com
 *   → Your Project → Project Settings → General → Your apps
 *
 * SECURITY: Never commit real credentials to public repositories.
 * Use environment-specific configuration for production deployments.
 * ─────────────────────────────────────────────────────────────
 */
const firebaseConfig = {
  apiKey:            "YOUR_FIREBASE_API_KEY",
  authDomain:        "YOUR_PROJECT.firebaseapp.com",
  projectId:         "YOUR_PROJECT_ID",
  storageBucket:     "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId:             "YOUR_APP_ID"
};

// ── Detect whether real credentials have been provided ───────────────────────
const FIREBASE_CONFIGURED = (
  firebaseConfig.apiKey        !== "YOUR_FIREBASE_API_KEY" &&
  firebaseConfig.projectId     !== "YOUR_PROJECT_ID" &&
  firebaseConfig.projectId     !== ""
);

window.FIREBASE_CONFIGURED = FIREBASE_CONFIGURED;

if (!FIREBASE_CONFIGURED) {
  console.warn(
    "[ZeptAI] Firebase is NOT configured. " +
    "Running in DEMO mode — authentication and Firestore are bypassed. " +
    "Update frontend/firebase-config.js with your project credentials."
  );
}

// ── Initialise Firebase (safe to call even with placeholders) ─────────────────
try {
  if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
  }
  window.fbAuth    = firebase.auth();
  window.fbDb      = firebase.firestore();
  window.fbStorage = firebase.storage();
} catch (e) {
  console.warn("[ZeptAI] Firebase init failed:", e.message);
  window.fbAuth    = null;
  window.fbDb      = null;
  window.fbStorage = null;
}
