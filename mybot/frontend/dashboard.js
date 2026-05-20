/**
 * ZeptAI — Dashboard Logic  |  dashboard.js
 */
'use strict';

const API = '';

document.addEventListener('authReady', async (e) => {
  const { user, profile } = e.detail;
  populateDashboard(user, profile);
  await loadRecentIntakes(profile);
});

function populateDashboard(user, profile) {
  const name = (profile && profile.fullName) || user.displayName || 'there';
  const firstName = name.split(' ')[0];

  /* Welcome */
  const el = document.getElementById('welcomeName');
  if (el) el.textContent = firstName;
  const dateEl = document.getElementById('welcomeDate');
  if (dateEl) {
    dateEl.textContent = new Date().toLocaleDateString('en-IN', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    });
  }

  /* Avatar */
  const avatarEl = document.getElementById('avatarEl');
  const avatarName = document.getElementById('avatarName');
  if (avatarEl) {
    if (profile && profile.photoURL) {
      avatarEl.innerHTML = `<img src="${escHtml(profile.photoURL)}" alt="" />`;
    } else {
      avatarEl.textContent = firstName.charAt(0).toUpperCase();
    }
  }
  if (avatarName) avatarName.textContent = firstName;

  /* Patient ID */
  const pidEl = document.getElementById('patientIdDisplay');
  if (pidEl) pidEl.textContent = (profile && profile.patientId) || 'ZPT-PENDING';

  /* Sidebar footer */
  const sbEl = document.getElementById('sidebarPatientId');
  if (sbEl) sbEl.textContent = (profile && profile.patientId) || 'ZeptAI';

  /* Profile completion bar */
  if (profile) {
    const fields = ['fullName','phoneNumber','age','gender','bloodGroup','address','allergies','currentMedications'];
    const filled = fields.filter(f => profile[f]).length;
    const pct = Math.round((filled / fields.length) * 100);
    const bar = document.getElementById('pcBar');
    const pctEl = document.getElementById('pcPct');
    if (bar)   bar.style.width = pct + '%';
    if (pctEl) pctEl.textContent = pct + '%';
    /* Hide the completion banner if profile is done */
    if (profile.profileCompleted) {
      const comp = document.getElementById('profileCompletionBar');
      if (comp) comp.style.display = 'none';
    }
  }
}

async function loadRecentIntakes(profile) {
  const listEl = document.getElementById('intakeList');
  if (!listEl) return;

  /* Try fetching recent sessions from FastAPI */
  try {
    const res = await fetch(`${API}/api/v1/sessions/list`);
    if (!res.ok) throw new Error('No sessions endpoint');
    const data = await res.json();
    const sessions = data.sessions || data || [];
    if (!sessions.length) {
      renderEmptyIntakes(listEl); return;
    }
    listEl.innerHTML = '';
    sessions.slice(0, 5).forEach(s => {
      listEl.appendChild(buildIntakeRow(s));
    });
  } catch {
    renderEmptyIntakes(listEl);
  }
}

function buildIntakeRow(session) {
  const row = document.createElement('div');
  row.className = 'intake-row';
  const date = session.created_at
    ? new Date(session.created_at).toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' })
    : 'Unknown date';
  row.innerHTML = `
    <div class="ir-left">
      <h4>${escHtml(session.patient_name || 'Patient')}</h4>
      <p>${date} &nbsp;·&nbsp; ${escHtml(session.state || 'Completed')}</p>
    </div>
    <button class="btn-view-report" onclick="window.open('/report?id=${escHtml(session.conversation_id || session.id)}','_blank')">
      📊 View Report
    </button>`;
  return row;
}

function renderEmptyIntakes(el) {
  el.innerHTML = `
    <div class="empty-state">
      <div class="empty-icon">📋</div>
      <p>No intake reports yet.<br/>Start your first AI-assisted intake session.</p>
    </div>`;
}

function copyPatientId() {
  const pid = document.getElementById('patientIdDisplay')?.textContent;
  if (!pid || pid === 'Loading…' || pid === 'ZPT-PENDING') return;
  navigator.clipboard.writeText(pid).then(() => {
    const chip = document.querySelector('.pid-chip');
    if (chip) { const orig = chip.textContent; chip.textContent = '✓ Copied!'; setTimeout(() => { chip.textContent = orig; }, 1500); }
  });
}

function scrollToReports() {
  document.getElementById('recentSection')?.scrollIntoView({ behavior: 'smooth' });
}

function escHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
