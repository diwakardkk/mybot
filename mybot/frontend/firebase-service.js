/**
 * ZeptAI — Firebase Service Layer
 * ──────────────────────────────────────────────────────────────
 * Centralises all Firestore + Storage operations.
 * Guards every call with FIREBASE_CONFIGURED check so demo mode
 * still works when credentials are not yet set.
 * ──────────────────────────────────────────────────────────────
 */

/* ── Patient ID generation ────────────────────────────────────────────────── */
function generatePatientId() {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let suffix = '';
  for (let i = 0; i < 6; i++) {
    suffix += chars[Math.floor(Math.random() * chars.length)];
  }
  return `ZPT-${date}-${suffix}`;
}

/* ── Demo / mock profile used when Firebase is not configured ─────────────── */
const DEMO_PROFILE = {
  uid:          'demo-user',
  patientId:    'ZPT-DEMO-000001',
  fullName:     'Demo Patient',
  email:        'demo@zeptai.app',
  phoneNumber:  '',
  photoURL:     '',
  age:          '',
  gender:       '',
  bloodGroup:   '',
  profileCompleted: false,
};

/* ═══════════════════════════════════════════════════════════════════════════
   PATIENT PROFILE
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Fetch patient profile from Firestore.
 * Returns null if the document does not exist yet.
 */
async function getPatientProfile(uid) {
  if (!window.FIREBASE_CONFIGURED || !window.fbDb) return DEMO_PROFILE;
  try {
    const snap = await window.fbDb.collection('patients').doc(uid).get();
    return snap.exists ? snap.data() : null;
  } catch (e) {
    console.error('[ZeptAI] getPatientProfile:', e);
    return null;
  }
}

/**
 * Create a new patient profile after first signup.
 */
async function createPatientProfile(uid, data) {
  if (!window.FIREBASE_CONFIGURED || !window.fbDb) {
    Object.assign(DEMO_PROFILE, data);
    return DEMO_PROFILE;
  }
  const profile = {
    uid,
    patientId:              generatePatientId(),
    fullName:               data.fullName   || '',
    email:                  data.email      || '',
    phoneNumber:            data.phoneNumber || '',
    photoURL:               data.photoURL   || '',
    age:                    data.age        || '',
    gender:                 data.gender     || '',
    bloodGroup:             data.bloodGroup || '',
    dateOfBirth:            data.dateOfBirth || '',
    address:                data.address    || '',
    emergencyContactName:   data.emergencyContactName   || '',
    emergencyContactNumber: data.emergencyContactNumber || '',
    allergies:              data.allergies  || '',
    currentMedications:     data.currentMedications || '',
    chronicConditions:      data.chronicConditions  || '',
    profileCompleted:       !!(data.fullName && data.phoneNumber),
    createdAt:              firebase.firestore.FieldValue.serverTimestamp(),
    updatedAt:              firebase.firestore.FieldValue.serverTimestamp(),
  };
  await window.fbDb.collection('patients').doc(uid).set(profile);
  return profile;
}

/**
 * Update an existing patient profile.
 */
async function updatePatientProfile(uid, updates) {
  if (!window.FIREBASE_CONFIGURED || !window.fbDb) {
    Object.assign(DEMO_PROFILE, updates);
    return;
  }
  await window.fbDb.collection('patients').doc(uid).update({
    ...updates,
    profileCompleted: !!(updates.fullName && updates.phoneNumber),
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
  });
}

/**
 * Ensure profile exists; create stub if not (e.g. after Google sign-in).
 */
async function ensurePatientProfile(firebaseUser) {
  if (!window.FIREBASE_CONFIGURED) return DEMO_PROFILE;
  let profile = await getPatientProfile(firebaseUser.uid);
  if (!profile) {
    profile = await createPatientProfile(firebaseUser.uid, {
      fullName:    firebaseUser.displayName || '',
      email:       firebaseUser.email       || '',
      phoneNumber: firebaseUser.phoneNumber || '',
      photoURL:    firebaseUser.photoURL    || '',
    });
  }
  return profile;
}

/* ═══════════════════════════════════════════════════════════════════════════
   MEDICAL REPORTS METADATA
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Save report metadata in Firestore after upload.
 */
async function saveReportMetadata(uid, meta) {
  if (!window.FIREBASE_CONFIGURED || !window.fbDb) return;
  const ref = window.fbDb
    .collection('patients').doc(uid)
    .collection('reports').doc(meta.reportId);
  await ref.set({
    ...meta,
    uid,
    uploadedAt: firebase.firestore.FieldValue.serverTimestamp(),
  });
}

/**
 * List all reports for a patient.
 */
async function listReports(uid) {
  if (!window.FIREBASE_CONFIGURED || !window.fbDb) return [];
  const snap = await window.fbDb
    .collection('patients').doc(uid)
    .collection('reports')
    .orderBy('uploadedAt', 'desc')
    .get();
  return snap.docs.map(d => d.data());
}

/**
 * Delete a report document and its storage file.
 */
async function deleteReport(uid, reportId, storagePath) {
  if (!window.FIREBASE_CONFIGURED || !window.fbDb) return;
  await window.fbDb
    .collection('patients').doc(uid)
    .collection('reports').doc(reportId).delete();
  if (storagePath && window.fbStorage) {
    await window.fbStorage.ref(storagePath).delete().catch(() => {});
  }
}

/* ── Expose globally ─────────────────────────────────────────────────────── */
window.ZeptAIService = {
  generatePatientId,
  getPatientProfile,
  createPatientProfile,
  updatePatientProfile,
  ensurePatientProfile,
  saveReportMetadata,
  listReports,
  deleteReport,
  DEMO_PROFILE,
};
