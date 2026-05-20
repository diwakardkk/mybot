/**
 * ZeptAI — Auth Page Logic  |  auth.js
 * ──────────────────────────────────────────────────────────────
 * Handles: email/password login+signup, mobile OTP, Google auth.
 * All Firebase errors are converted to friendly user messages.
 */
'use strict';

/* ── State ── */
let confirmationResult = null;   // for phone OTP
let recaptchaVerifier  = null;
let pendingGoogleUser  = null;   // for post-Google phone collection

/* ── Init ── */
document.addEventListener('DOMContentLoaded', () => {
  /* Pre-select tab based on URL param  (?mode=login or ?mode=signup) */
  const mode = new URLSearchParams(window.location.search).get('mode');
  if (mode === 'signup') switchTab('signup');

  /* If already logged in and profile complete → redirect to dashboard */
  if (window.FIREBASE_CONFIGURED && window.fbAuth) {
    window.fbAuth.onAuthStateChanged(async (user) => {
      if (!user) return;
      const profile = await window.ZeptAIService.ensurePatientProfile(user);
      if (profile && profile.profileCompleted) {
        window.location.href = '/dashboard';
      } else if (profile && !profile.profileCompleted) {
        window.location.href = '/profile';
      }
    });
  }
});

/* ════════════════════════════════════════════════════════════
   TAB / METHOD SWITCHING
   ════════════════════════════════════════════════════════════ */
function switchTab(tab) {
  document.getElementById('loginPanel') .classList.toggle('hidden', tab !== 'login');
  document.getElementById('signupPanel').classList.toggle('hidden', tab !== 'signup');
  document.getElementById('phoneCompletePanel').classList.add('hidden');
  document.getElementById('tabLogin') .classList.toggle('active', tab === 'login');
  document.getElementById('tabSignup').classList.toggle('active', tab === 'signup');
  clearBanner();
}

function switchMethod(method) {
  document.getElementById('emailLoginSection').classList.toggle('hidden', method !== 'email');
  document.getElementById('phoneLoginSection').classList.toggle('hidden', method !== 'phone');
  document.getElementById('mTabEmail').classList.toggle('active', method === 'email');
  document.getElementById('mTabPhone').classList.toggle('active', method === 'phone');
  clearBanner();
}

/* ════════════════════════════════════════════════════════════
   EMAIL / PASSWORD
   ════════════════════════════════════════════════════════════ */
async function loginWithEmail() {
  clearBanner();
  const email = val('loginEmail');
  const pass  = val('loginPassword');
  if (!validateEmail(email, 'loginEmailErr')) return;
  if (!pass) { showFieldErr('loginPassErr', 'Password is required'); return; }

  setLoading('btnEmailLogin', 'spinEmailLogin', true);
  if (!window.FIREBASE_CONFIGURED) {
    showBanner('Demo mode — Firebase not configured. Redirecting…', 'success');
    setTimeout(() => { window.location.href = '/dashboard'; }, 1200);
    return;
  }
  try {
    await window.fbAuth.signInWithEmailAndPassword(email, pass);
    await postLoginRedirect(window.fbAuth.currentUser);
  } catch (e) {
    showBanner(friendlyError(e), 'error');
    setLoading('btnEmailLogin', 'spinEmailLogin', false);
  }
}

async function signupWithEmail() {
  clearBanner();
  const name  = val('signupName');
  const email = val('signupEmail');
  const pass  = val('signupPassword');
  const cc    = val('signupCountryCode') || '+91';
  const phone = val('signupPhone');

  let ok = true;
  if (!name)  { showFieldErr('signupNameErr',  'Full name is required');  ok = false; }
  if (!validateEmail(email, 'signupEmailErr')) ok = false;
  if (pass.length < 8) { showFieldErr('signupPassErr', 'Password must be at least 8 characters'); ok = false; }
  if (phone && !validatePhoneNumber(phone)) { showFieldErr('signupPhoneErr', 'Enter a valid mobile number'); ok = false; }
  if (!ok) return;

  setLoading('btnSignup', 'spinSignup', true);
  if (!window.FIREBASE_CONFIGURED) {
    showBanner('Demo mode — Firebase not configured. Redirecting…', 'success');
    setTimeout(() => { window.location.href = '/profile'; }, 1200);
    return;
  }
  try {
    const cred = await window.fbAuth.createUserWithEmailAndPassword(email, pass);
    await cred.user.updateProfile({ displayName: name });
    await window.ZeptAIService.createPatientProfile(cred.user.uid, {
      fullName: name, email, phoneNumber: phone ? `${cc}${phone}` : '',
    });
    await postLoginRedirect(cred.user);
  } catch (e) {
    showBanner(friendlyError(e), 'error');
    setLoading('btnSignup', 'spinSignup', false);
  }
}

/* ════════════════════════════════════════════════════════════
   PHONE OTP
   ════════════════════════════════════════════════════════════ */
async function sendOTP() {
  clearBanner();
  const cc    = val('loginCountryCode') || '+91';
  const phone = val('loginPhone');
  if (!phone || !validatePhoneNumber(phone)) {
    showFieldErr('loginPhoneErr', 'Enter a valid mobile number'); return;
  }
  if (!window.FIREBASE_CONFIGURED) {
    showBanner('Phone auth requires Firebase configuration. Use Email login in demo mode.', 'error'); return;
  }

  setLoading('btnSendOtp', 'spinSendOtp', true);
  try {
    if (!recaptchaVerifier) {
      recaptchaVerifier = new firebase.auth.RecaptchaVerifier('recaptcha-container', {
        size: 'invisible',
        callback: () => {},
        'expired-callback': () => { recaptchaVerifier = null; },
      });
    }
    const fullPhone = cc + phone.replace(/^0+/, '');
    confirmationResult = await window.fbAuth.signInWithPhoneNumber(fullPhone, recaptchaVerifier);
    document.getElementById('phoneStep1Form').classList.add('hidden');
    document.getElementById('phoneStep2Form').classList.remove('hidden');
    document.getElementById('otpHint').textContent = `OTP sent to ${fullPhone}. Please check your messages.`;
    setLoading('btnSendOtp', 'spinSendOtp', false);
  } catch (e) {
    showBanner(friendlyError(e), 'error');
    setLoading('btnSendOtp', 'spinSendOtp', false);
    recaptchaVerifier = null;
  }
}

async function verifyOTP() {
  clearBanner();
  const otp = val('otpInput');
  if (!otp || otp.length < 6) { showFieldErr('otpErr', 'Enter the 6-digit OTP'); return; }
  setLoading('btnVerifyOtp', 'spinVerifyOtp', true);
  try {
    const result = await confirmationResult.confirm(otp);
    const profile = await window.ZeptAIService.ensurePatientProfile(result.user);
    await postLoginRedirect(result.user, profile);
  } catch (e) {
    showFieldErr('otpErr', friendlyError(e));
    setLoading('btnVerifyOtp', 'spinVerifyOtp', false);
  }
}

function resetPhoneFlow() {
  document.getElementById('phoneStep1Form').classList.remove('hidden');
  document.getElementById('phoneStep2Form').classList.add('hidden');
  document.getElementById('loginPhone').value = '';
  confirmationResult = null;
}

/* ════════════════════════════════════════════════════════════
   GOOGLE AUTH
   ════════════════════════════════════════════════════════════ */
async function loginWithGoogle() {
  clearBanner();
  if (!window.FIREBASE_CONFIGURED) {
    showBanner('Google auth requires Firebase configuration. Redirecting in demo mode…', 'success');
    setTimeout(() => { window.location.href = '/dashboard'; }, 1500);
    return;
  }
  try {
    const provider = new firebase.auth.GoogleAuthProvider();
    provider.addScope('profile'); provider.addScope('email');
    const result = await window.fbAuth.signInWithPopup(provider);
    const user = result.user;

    /* Ensure profile exists */
    let profile = await window.ZeptAIService.ensurePatientProfile(user);

    /* If phone number is missing, ask for it */
    if (!profile.phoneNumber) {
      pendingGoogleUser = user;
      document.getElementById('loginPanel') .classList.add('hidden');
      document.getElementById('signupPanel').classList.add('hidden');
      document.getElementById('phoneCompletePanel').classList.remove('hidden');
      document.getElementById('tabLogin') .classList.remove('active');
      document.getElementById('tabSignup').classList.remove('active');
      return;
    }
    await postLoginRedirect(user, profile);
  } catch (e) {
    if (e.code === 'auth/popup-blocked') {
      showBanner('Popup was blocked. Please allow popups for this site and try again.', 'error');
    } else {
      showBanner(friendlyError(e), 'error');
    }
  }
}

async function saveGooglePhone() {
  const cc    = val('gcCountryCode') || '+91';
  const phone = val('gcPhone');
  if (!phone || !validatePhoneNumber(phone)) { showFieldErr('gcPhoneErr', 'Enter a valid mobile number'); return; }
  setLoading('btnSavePhone', 'spinSavePhone', true);
  const fullPhone = `${cc}${phone.replace(/^0+/, '')}`;
  await window.ZeptAIService.updatePatientProfile(pendingGoogleUser.uid, {
    phoneNumber: fullPhone, profileCompleted: !!(pendingGoogleUser.displayName && fullPhone),
  });
  await postLoginRedirect(pendingGoogleUser);
}

function skipPhone() {
  window.location.href = '/profile';
}

/* ════════════════════════════════════════════════════════════
   POST-LOGIN REDIRECT
   ════════════════════════════════════════════════════════════ */
async function postLoginRedirect(user, profile) {
  if (!profile) {
    profile = await window.ZeptAIService.getPatientProfile(user.uid);
  }
  if (!profile || !profile.profileCompleted) {
    window.location.href = '/profile';
  } else {
    window.location.href = '/dashboard';
  }
}

/* ════════════════════════════════════════════════════════════
   VALIDATION HELPERS
   ════════════════════════════════════════════════════════════ */
function validateEmail(email, errId) {
  if (!email) { showFieldErr(errId, 'Email is required'); return false; }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { showFieldErr(errId, 'Enter a valid email address'); return false; }
  clearFieldErr(errId); return true;
}

function validatePhoneNumber(phone) {
  /* Strip leading zeros and spaces; allow 7-15 digits */
  return /^\d{7,15}$/.test(phone.replace(/[\s\-()]/g, ''));
}

/* ════════════════════════════════════════════════════════════
   FRIENDLY ERROR MESSAGES
   ════════════════════════════════════════════════════════════ */
function friendlyError(e) {
  const map = {
    'auth/user-not-found':            'No account found with this email. Please sign up.',
    'auth/wrong-password':            'Incorrect password. Please try again.',
    'auth/email-already-in-use':      'An account already exists with this email. Please log in.',
    'auth/weak-password':             'Password is too weak. Use at least 8 characters.',
    'auth/invalid-email':             'Please enter a valid email address.',
    'auth/invalid-verification-code': 'The OTP you entered is incorrect. Please check and try again.',
    'auth/code-expired':              'OTP has expired. Please request a new one.',
    'auth/too-many-requests':         'Too many attempts. Please wait a few minutes and try again.',
    'auth/network-request-failed':    'Network error. Please check your internet connection.',
    'auth/popup-closed-by-user':      'Login popup was closed. Please try again.',
    'auth/cancelled-popup-request':   'Login was cancelled. Please try again.',
    'auth/invalid-phone-number':      'Please enter a valid phone number with country code.',
    'auth/quota-exceeded':            'Too many OTP requests. Please try again later.',
    'auth/captcha-check-failed':      'Security check failed. Please reload and try again.',
  };
  return map[e.code] || `Something went wrong: ${e.message || 'Please try again.'}`;
}

/* ════════════════════════════════════════════════════════════
   UI HELPERS
   ════════════════════════════════════════════════════════════ */
function val(id) { return (document.getElementById(id)?.value || '').trim(); }
function showBanner(msg, type) {
  const el = document.getElementById('authBanner');
  el.textContent = msg; el.className = `auth-banner ${type}`;
}
function clearBanner() {
  const el = document.getElementById('authBanner');
  el.textContent = ''; el.className = 'auth-banner';
}
function showFieldErr(id, msg) { const el = document.getElementById(id); if (el) { el.textContent = msg; el.classList.add('show'); } }
function clearFieldErr(id)     { const el = document.getElementById(id); if (el) { el.textContent = ''; el.classList.remove('show'); } }
function setLoading(btnId, spinnerId, on) {
  const btn  = document.getElementById(btnId);
  const spin = document.getElementById(spinnerId);
  if (btn)  btn.disabled = on;
  if (spin) spin.style.display = on ? 'block' : 'none';
}
