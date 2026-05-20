/**
 * ZeptAI — Profile Page Logic  |  profile.js
 */
'use strict';

let _currentUser = null;

const FIELDS = [
  'fullName','age','gender','dateOfBirth','bloodGroup','phoneNumber','address',
  'allergies','currentMedications','chronicConditions','pastSurgeries','familyHistory',
  'emergencyName','emergencyRelation','emergencyPhone',
];

document.addEventListener('authReady', async (e) => {
  const { user, profile } = e.detail;
  _currentUser = user;
  populateForm(user, profile);
});

function populateForm(user, profile) {
  /* Header */
  const name = (profile && profile.fullName) || user.displayName || 'Patient';
  setEl('headerName', name);
  setEl('headerEmail', user.email || user.phoneNumber || '');
  setEl('headerPid', (profile && profile.patientId) || 'ZPT-PENDING');
  const letter = document.getElementById('avatarLetter');
  if (letter) letter.textContent = name.charAt(0).toUpperCase();
  if (profile && profile.photoURL) {
    const av = document.getElementById('avatarLetter');
    if (av) av.outerHTML = `<img src="${escHtml(profile.photoURL)}" alt="" id="avatarLetter" />`;
  }

  /* Fill form fields */
  if (!profile) return;
  FIELDS.forEach(f => {
    const el = document.getElementById(f);
    if (el && profile[f] !== undefined && profile[f] !== null) {
      el.value = profile[f];
    }
  });
}

async function saveProfile() {
  const btn  = document.getElementById('btnSave');
  const spin = document.getElementById('saveSpin');
  if (!_currentUser) { showBanner('Not authenticated.', 'error'); return; }

  /* Validate required */
  const name = gval('fullName');
  if (!name) { showBanner('Full name is required.', 'error'); return; }

  btn.disabled = true;
  if (spin) spin.style.display = 'block';
  clearBanner();

  const data = {};
  FIELDS.forEach(f => { data[f] = gval(f); });

  /* Profile completeness check */
  const coreFields = ['fullName','phoneNumber','age','gender','bloodGroup'];
  data.profileCompleted = coreFields.every(f => data[f]);

  try {
    await window.ZeptAIService.updatePatientProfile(_currentUser.uid, data);
    showBanner('Profile saved successfully! ✓', 'success');
    setEl('headerName', data.fullName);
    const letter = document.getElementById('avatarLetter');
    if (letter && letter.tagName === 'SPAN') letter.textContent = data.fullName.charAt(0).toUpperCase();
    if (data.profileCompleted) {
      setTimeout(() => { window.location.href = '/dashboard'; }, 1200);
    }
  } catch (err) {
    showBanner(`Failed to save: ${err.message || 'Please try again.'}`, 'error');
  } finally {
    btn.disabled = false;
    if (spin) spin.style.display = 'none';
  }
}

function handlePhotoChange(input) {
  const file = input.files && input.files[0];
  if (!file) return;
  if (!file.type.startsWith('image/')) { showBanner('Please select an image file.', 'error'); return; }
  const reader = new FileReader();
  reader.onload = (ev) => {
    const av = document.querySelector('.profile-avatar');
    if (!av) return;
    /* Preview */
    const existing = document.getElementById('avatarLetter');
    const img = document.createElement('img');
    img.src = ev.target.result;
    img.id = 'avatarLetter';
    if (existing) existing.replaceWith(img);
  };
  reader.readAsDataURL(file);
  /* Note: actual Firebase Storage upload can be wired in reports.js pattern */
}

/* ── Helpers ── */
function gval(id) { return (document.getElementById(id)?.value || '').trim(); }
function setEl(id, val) { const el = document.getElementById(id); if (el) el.textContent = val; }
function showBanner(msg, type) {
  const el = document.getElementById('profileBanner');
  if (!el) return;
  el.textContent = msg; el.className = `profile-banner ${type}`;
  el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
function clearBanner() {
  const el = document.getElementById('profileBanner');
  if (el) { el.textContent = ''; el.className = 'profile-banner'; }
}
function escHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
