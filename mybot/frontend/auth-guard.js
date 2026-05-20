/**
 * ZeptAI — Auth Guard
 * ──────────────────────────────────────────────────────────────
 * Include this script on every protected page (dashboard, intake,
 * profile, reports).
 *
 * Behaviour:
 *   1. Listens to Firebase auth state change.
 *   2. If no user  → redirect to /auth
 *   3. If user has incomplete profile → redirect to /profile
 *      (unless we are already on /profile — avoids redirect loop)
 *   4. If user is fine → expose window.currentUser &
 *      window.currentPatientProfile for the page to use.
 *   5. In DEMO mode (Firebase not configured) it creates a mock
 *      session so the rest of the app still functions.
 *
 * Usage (add before closing </body> on protected pages):
 *   <script src="/static/firebase-config.js"></script>
 *   <script src="/static/firebase-service.js"></script>
 *   <script src="/static/auth-guard.js"></script>
 * ──────────────────────────────────────────────────────────────
 */

(function () {
  'use strict';

  /* Pages that are protected (require login) */
  const PROTECTED_PATHS = ['/dashboard', '/intake', '/profile', '/reports'];
  /* The profile page itself — avoid redirect loops */
  const IS_PROFILE_PAGE  = window.location.pathname.includes('/profile');
  const IS_INTAKE_PAGE   = window.location.pathname.includes('/intake');

  /* ── DEMO MODE ─────────────────────────────────────────────────────────── */
  if (!window.FIREBASE_CONFIGURED) {
    console.warn('[AuthGuard] Demo mode — auth bypassed.');
    const demoUser = {
      uid:         'demo-user',
      displayName: 'Demo Patient',
      email:       'demo@zeptai.app',
    };
    const demoProfile = window.ZeptAIService
      ? { ...window.ZeptAIService.DEMO_PROFILE }
      : { fullName: 'Demo Patient', patientId: 'ZPT-DEMO-000001', profileCompleted: false };

    window.currentUser           = demoUser;
    window.currentPatientProfile = demoProfile;

    // Fire a custom event so pages can initialise with user data
    document.dispatchEvent(new CustomEvent('authReady', { detail: { user: demoUser, profile: demoProfile } }));
    return;
  }

  /* ── REAL FIREBASE AUTH ────────────────────────────────────────────────── */
  if (!window.fbAuth) {
    console.error('[AuthGuard] fbAuth not available. Ensure firebase-config.js is loaded first.');
    return;
  }

  /* Show a "Checking session…" overlay while auth resolves */
  _showAuthOverlay();

  window.fbAuth.onAuthStateChanged(async (user) => {
    if (!user) {
      /* Not logged in → go to auth page */
      window.location.href = '/auth';
      return;
    }

    /* User is logged in — fetch/create profile */
    let profile = null;
    try {
      profile = await window.ZeptAIService.ensurePatientProfile(user);
    } catch (e) {
      console.error('[AuthGuard] Could not load profile:', e);
    }

    window.currentUser           = user;
    window.currentPatientProfile = profile;

    /* If profile is incomplete and we are NOT already on the profile page */
    if (profile && !profile.profileCompleted && !IS_PROFILE_PAGE) {
      window.location.href = '/profile';
      return;
    }

    /* All good — hide overlay and let the page run */
    _hideAuthOverlay();
    document.dispatchEvent(new CustomEvent('authReady', { detail: { user, profile } }));
  });

  /* ── helpers ────────────────────────────────────────────────────────────── */
  function _showAuthOverlay() {
    const el = document.createElement('div');
    el.id = '__authOverlay';
    el.style.cssText = [
      'position:fixed;inset:0;z-index:9999',
      'background:#fff',
      'display:flex;align-items:center;justify-content:center',
      'flex-direction:column;gap:12px',
      'font-family:Inter,system-ui,sans-serif',
    ].join(';');
    el.innerHTML = `
      <div style="width:40px;height:40px;border:3px solid #e2e8f0;border-top-color:#2563eb;border-radius:50%;animation:__spin 0.7s linear infinite"></div>
      <span style="color:#64748b;font-size:14px">Checking session…</span>
      <style>@keyframes __spin{to{transform:rotate(360deg)}}</style>`;
    document.body.appendChild(el);
  }

  function _hideAuthOverlay() {
    const el = document.getElementById('__authOverlay');
    if (el) el.remove();
  }

  /* ── Global sign-out helper ──────────────────────────────────────────────── */
  window.zeptSignOut = async function () {
    await window.fbAuth.signOut();
    window.location.href = '/';
  };
})();
