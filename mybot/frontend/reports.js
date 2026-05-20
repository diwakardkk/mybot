/**
 * ZeptAI — Medical Reports Logic  |  reports.js
 */
'use strict';

const MAX_SIZE_MB = 10;
const ALLOWED_TYPES = ['application/pdf','image/png','image/jpeg','application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
const ALLOWED_EXT  = /\.(pdf|png|jpg|jpeg|doc|docx)$/i;

let _uid = null;

document.addEventListener('authReady', async (e) => {
  const { user } = e.detail;
  _uid = user.uid;
  await loadReports();
});

/* ════════════════════════════════════════════════════════════
   DRAG & DROP
   ════════════════════════════════════════════════════════════ */
function handleDragOver(e)  { e.preventDefault(); document.getElementById('dropzone')?.classList.add('over'); }
function handleDragLeave(e) { document.getElementById('dropzone')?.classList.remove('over'); }
function handleDrop(e) {
  e.preventDefault();
  document.getElementById('dropzone')?.classList.remove('over');
  processFiles(Array.from(e.dataTransfer.files));
}
function handleFileSelect(fileList) { processFiles(Array.from(fileList)); }

function processFiles(files) {
  clearBanner();
  const valid = files.filter(f => {
    if (!ALLOWED_EXT.test(f.name)) { showBanner(`"${f.name}" — unsupported file type.`, 'error'); return false; }
    if (f.size > MAX_SIZE_MB * 1024 * 1024) { showBanner(`"${f.name}" exceeds ${MAX_SIZE_MB} MB.`, 'error'); return false; }
    return true;
  });
  if (!valid.length) return;
  valid.forEach(uploadFile);
}

/* ════════════════════════════════════════════════════════════
   UPLOAD
   ════════════════════════════════════════════════════════════ */
async function uploadFile(file) {
  if (!_uid) { showBanner('Not authenticated.', 'error'); return; }

  const progressWrap = document.getElementById('uploadProgress');
  const upBar  = document.getElementById('upBar');
  const upPct  = document.getElementById('upPct');
  const upName = document.getElementById('upFileName');
  if (progressWrap) { progressWrap.style.display = 'block'; }
  if (upName) upName.textContent = file.name;
  setProgress(0);

  const reportId = `rpt_${Date.now()}_${Math.random().toString(36).slice(2,7)}`;

  /* Demo mode fallback */
  if (!window.FIREBASE_CONFIGURED) {
    await simulateDemoUpload(file, reportId);
    return;
  }

  try {
    let uploadBlob = file;
    let ivB64 = null;

    /* Optional AES-GCM encryption */
    if (window.ZeptCrypto && window.ZeptCrypto.ENCRYPTION_ENABLED) {
      const key = await window.ZeptCrypto.getSessionKey(_uid);
      const enc = await window.ZeptCrypto.encryptFile(file, key);
      uploadBlob = enc.blob;
      ivB64 = enc.ivB64;
    }

    const storagePath = `users/${_uid}/reports/${reportId}/${file.name}`;
    const storageRef = window.fbStorage.ref(storagePath);
    const uploadTask = storageRef.put(uploadBlob);

    uploadTask.on('state_changed',
      (snap) => {
        const pct = Math.round((snap.bytesTransferred / snap.totalBytes) * 100);
        setProgress(pct);
      },
      (err) => {
        showBanner(`Upload failed: ${err.message}`, 'error');
        if (progressWrap) progressWrap.style.display = 'none';
      },
      async () => {
        const downloadURL = await uploadTask.snapshot.ref.getDownloadURL();
        const meta = {
          reportId, name: file.name,
          type: file.type || 'application/octet-stream',
          sizeMB: (file.size / 1048576).toFixed(2),
          storagePath, downloadURL,
          encrypted: !!(window.ZeptCrypto?.ENCRYPTION_ENABLED),
          ivB64: ivB64 || null,
          uploadedAt: new Date().toISOString(),
        };
        await window.ZeptAIService.saveReportMetadata(_uid, meta);
        showBanner(`"${file.name}" uploaded successfully ✓`, 'success');
        if (progressWrap) progressWrap.style.display = 'none';
        setProgress(0);
        await loadReports();
      }
    );
  } catch (err) {
    showBanner(`Upload error: ${err.message || 'Please try again.'}`, 'error');
    if (progressWrap) progressWrap.style.display = 'none';
  }
}

/* Simulate progress for demo/dev */
async function simulateDemoUpload(file, reportId) {
  for (let p = 0; p <= 100; p += 20) {
    setProgress(p);
    await sleep(120);
  }
  /* Save in sessionStorage for demo rendering */
  const demoReports = JSON.parse(sessionStorage.getItem('demoReports') || '[]');
  demoReports.unshift({
    reportId, name: file.name,
    type: file.type,
    sizeMB: (file.size / 1048576).toFixed(2),
    uploadedAt: new Date().toISOString(),
    downloadURL: null,
  });
  sessionStorage.setItem('demoReports', JSON.stringify(demoReports));
  showBanner(`"${file.name}" uploaded (demo mode) ✓`, 'success');
  const pw = document.getElementById('uploadProgress');
  if (pw) pw.style.display = 'none';
  setProgress(0);
  await loadReports();
}

/* ════════════════════════════════════════════════════════════
   LOAD REPORTS
   ════════════════════════════════════════════════════════════ */
async function loadReports() {
  const listEl = document.getElementById('reportsList');
  if (!listEl) return;
  listEl.innerHTML = '<div class="empty-state"><div class="empty-icon">⏳</div><p>Loading…</p></div>';

  let reports = [];
  if (!window.FIREBASE_CONFIGURED) {
    reports = JSON.parse(sessionStorage.getItem('demoReports') || '[]');
  } else {
    try {
      reports = await window.ZeptAIService.listReports(_uid);
    } catch {
      reports = [];
    }
  }

  if (!reports.length) {
    listEl.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📋</div>
        <p>No reports uploaded yet.<br/>Drop a file above to get started.</p>
      </div>`;
    return;
  }

  listEl.innerHTML = '';
  reports.forEach(r => listEl.appendChild(buildReportRow(r)));
}

function buildReportRow(r) {
  const row = document.createElement('div');
  row.className = 'report-row';
  const icon = iconForType(r.type || r.name);
  const date = r.uploadedAt
    ? new Date(r.uploadedAt).toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' })
    : 'Unknown date';
  const enc  = r.encrypted ? ' · 🔒 Encrypted' : '';
  row.innerHTML = `
    <div class="report-type-icon">${icon}</div>
    <div class="report-info">
      <h4>${escHtml(r.name)}</h4>
      <p>${date} · ${r.sizeMB || '—'} MB${enc}</p>
    </div>
    <div class="report-actions">
      ${r.downloadURL ? `<button class="btn-dl" onclick="window.open('${escHtml(r.downloadURL)}','_blank')">⬇ Download</button>` : '<span style="font-size:12px;color:var(--dim)">Demo</span>'}
      <button class="btn-del" onclick="deleteReport('${escHtml(r.reportId)}','${escHtml(r.storagePath||'')}')">🗑 Delete</button>
    </div>`;
  return row;
}

async function deleteReport(reportId, storagePath) {
  if (!confirm('Delete this report? This cannot be undone.')) return;
  clearBanner();
  if (!window.FIREBASE_CONFIGURED) {
    let demo = JSON.parse(sessionStorage.getItem('demoReports') || '[]');
    demo = demo.filter(r => r.reportId !== reportId);
    sessionStorage.setItem('demoReports', JSON.stringify(demo));
    showBanner('Report deleted (demo mode).', 'success');
    await loadReports(); return;
  }
  try {
    await window.ZeptAIService.deleteReport(_uid, reportId, storagePath || null);
    showBanner('Report deleted.', 'success');
    await loadReports();
  } catch (err) {
    showBanner(`Could not delete: ${err.message}`, 'error');
  }
}

/* ════════════════════════════════════════════════════════════
   HELPERS
   ════════════════════════════════════════════════════════════ */
function iconForType(typeOrName) {
  const s = (typeOrName || '').toLowerCase();
  if (s.includes('pdf'))  return '📄';
  if (s.includes('png') || s.includes('jpg') || s.includes('jpeg') || s.includes('image')) return '🖼️';
  if (s.includes('doc'))  return '📝';
  return '📁';
}
function setProgress(pct) {
  const bar = document.getElementById('upBar');
  const pctEl = document.getElementById('upPct');
  if (bar)   bar.style.width = pct + '%';
  if (pctEl) pctEl.textContent = pct + '%';
}
function showBanner(msg, type) {
  const el = document.getElementById('reportsBanner');
  if (!el) return; el.textContent = msg; el.className = `reports-banner ${type}`;
  el.scrollIntoView({ behavior:'smooth', block:'nearest' });
  if (type === 'success') setTimeout(() => clearBanner(), 5000);
}
function clearBanner() {
  const el = document.getElementById('reportsBanner');
  if (el) { el.textContent = ''; el.className = 'reports-banner'; }
}
function escHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
