/* ─────────────────────────────────────────────────────────────────────────────
   Hospital Intake Bot — report.js  (complete rewrite)
   Handles: data fetching, Chart.js vitals, PDF, local save, listen TTS
───────────────────────────────────────────────────────────────────────────── */
const API = '';
const params = new URLSearchParams(window.location.search);
const convId = params.get('id');
let reportData = null;
let listenAudio = null;

Chart.defaults.color = '#8b949e';
Chart.defaults.font.family = "'Inter', system-ui, sans-serif";

// ── Init ──────────────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  const now = new Date();
  const fmt = now.toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  setEl('printDate', fmt);
  setEl('pfDate', fmt);
  setEl('footerId', convId ? 'ID: ' + convId.slice(0, 8) + '…' : '');

  const d15 = new Date(); d15.setDate(d15.getDate() + 15);
  document.getElementById('fuDate').value = d15.toISOString().split('T')[0];

  if (!convId) {
    showError('No conversation ID. Open this page from the chat after a session.');
    return;
  }
  loadReport();
});

// ── Load & Render ─────────────────────────────────────────────────────────────
async function loadReport() {
  showLoading(true);
  try {
    const res = await fetch(`${API}/api/v1/report/full/${convId}`);
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Server returned ${res.status}: ${text.slice(0, 200)}`);
    }
    reportData = await res.json();
    renderAll(reportData);
  } catch (e) {
    showError('Failed to load report: ' + e.message);
  } finally {
    showLoading(false);
  }
}

function showLoading(on) {
  const el = document.getElementById('loadingState');
  if (on) {
    el.style.display = 'flex';
    el.innerHTML = '<div class="spinner"></div><p>Generating Report — this may take 15–30 seconds…</p>';
  } else {
    el.style.display = 'none';
  }
}

function showError(msg) {
  const el = document.getElementById('loadingState');
  el.style.display = 'flex';
  el.style.color = '#ef4444';
  el.innerHTML = `<div style="font-size:28px">⚠️</div><p>${msg}</p>`;
}

// ── Render ────────────────────────────────────────────────────────────────────
function renderAll(rd) {
  const analysis = rd.analysis || {};
  const summary = rd.summary || {};
  const vitals = rd.vitals || {};

  const name = rd.patient_name || summary.patient_name || 'Unknown Patient';
  const age = rd.age || summary.age || '—';
  const gender = rd.gender || summary.gender || '—';
  const urgency = analysis.urgency || 'routine';
  const risk = analysis.risk_level || 'low';

  document.getElementById('rptSubtitle').textContent =
    `Generated: ${new Date(rd.generated_at).toLocaleString()}`;

  // ── Patient Banner ────────────────────────────────────────────────────────
  setEl('pbAvatar', name.charAt(0).toUpperCase() || '?');
  setEl('pbName', name);
  setEl('pbAge', 'Age: ' + age);
  setEl('pbGender', 'Gender: ' + gender);
  setEl('pbComplaint', analysis.chief_complaint_summary || summary.chief_complaint || '—');
  setEl('pbDuration', summary.duration || '—');
  setEl('pbQuestions', (summary.questions_completed || '—') + '/7');
  setEl('pbDate', new Date(rd.generated_at).toLocaleDateString());
  urgencyEl('pbUrgency', urgency);
  riskEl('pbRisk', risk);
  showSec('secBanner');

  // ── Vitals ────────────────────────────────────────────────────────────────
  showSec('secVitals');
  buildVitalChips(vitals);
  buildCharts(vitals);

  // ── AI Summary ────────────────────────────────────────────────────────────
  // Prefer GPT-refined summary; fall back through hierarchy
  const refinedText = analysis.refined_summary || summary.summary_text || analysis.chief_complaint_summary || '—';
  const symptomText = analysis.symptom_analysis || '—';
  setEl('clinicalSummary', refinedText);
  setEl('symptomAnalysis', symptomText);

  const meds = summary.medications;
  setEl('aiMeds', Array.isArray(meds) ? (meds.join(', ') || 'None reported') : (meds || '—'));
  const allergies = summary.allergies;
  setEl('aiAllergies', Array.isArray(allergies) ? (allergies.join(', ') || 'None reported') : (allergies || '—'));
  setEl('aiMedConcerns', analysis.medication_concerns || '—');

  const kf = analysis.key_findings || [];
  document.getElementById('keyFindings').innerHTML =
    kf.length ? kf.map(f => `<li>${esc(f)}</li>`).join('') : '<li>Complete the intake conversation to generate findings.</li>';

  const rf = analysis.red_flags || [];
  if (rf.length) {
    document.getElementById('redFlagSection').classList.remove('hidden');
    document.getElementById('redFlags').innerHTML = rf.map(f => `<li>${esc(f)}</li>`).join('');
  }
  showSec('secSummary');

  // ── Recommendations ───────────────────────────────────────────────────────
  const recs = analysis.clinical_recommendations || [];
  document.getElementById('aiRecos').innerHTML =
    recs.length ? recs.map(r => `<li>${esc(r)}</li>`).join('') : '<li>Complete the intake conversation first.</li>';

  if (analysis.suggested_follow_up_days) {
    const radio = document.querySelector(`input[name="fu"][value="${analysis.suggested_follow_up_days}"]`);
    if (radio) radio.checked = true;
  }

  // Pre-fill doctor notes if saved previously
  const reco = rd.recommendation || {};
  if (reco.doctor_notes) document.getElementById('doctorNotes').value = reco.doctor_notes;

  showSec('secReco');

  // ── Transcript ────────────────────────────────────────────────────────────
  fetchAndRenderTranscript();
  showSec('secConv');
}

// ── Vital Chips ───────────────────────────────────────────────────────────────
function buildVitalChips(v) {
  const bmi = v.bmi_value || autoBMI(v.weight_kg, v.height_cm);
  const chips = [
    { lbl: 'Systolic', val: fmtVal(v.bp_systolic, 'mmHg'), cat: bpCat(v.bp_systolic, v.bp_diastolic), cls: bpCls(v.bp_systolic) },
    { lbl: 'Diastolic', val: fmtVal(v.bp_diastolic, 'mmHg'), cat: '', cls: '' },
    { lbl: 'Blood Sugar', val: fmtVal(v.blood_sugar, 'mg/dL'), cat: sugarCat(v.blood_sugar), cls: sugarCls(v.blood_sugar) },
    { lbl: 'Weight', val: fmtVal(v.weight_kg, 'kg'), cat: '', cls: '' },
    { lbl: 'Height', val: fmtVal(v.height_cm, 'cm'), cat: '', cls: '' },
    { lbl: 'BMI', val: bmi ? String(bmi) : '—', cat: bmiCat(bmi), cls: bmiCls(bmi) },
    { lbl: 'Temperature', val: fmtVal(v.temperature, '°C'), cat: v.temperature > 38 ? 'Fever' : v.temperature ? 'Normal' : '', cls: v.temperature > 38 ? 'err' : 'ok' },
    { lbl: 'Pulse', val: fmtVal(v.pulse, 'bpm'), cat: (v.pulse && (v.pulse > 100 || v.pulse < 60)) ? 'Abnormal' : v.pulse ? 'Normal' : '', cls: (v.pulse && (v.pulse > 100 || v.pulse < 60)) ? 'warn' : 'ok' },
  ];
  document.getElementById('vitalChips').innerHTML = chips.map(c => `
    <div class="vc">
      <div class="vc-val">${c.val}</div>
      <div class="vc-lbl">${c.lbl}</div>
      ${c.cat ? `<div class="vc-cat ${c.cls}">${c.cat}</div>` : ''}
    </div>`).join('');
}

function fmtVal(v, unit) { return v != null ? `${v} ${unit}` : '—'; }

// ── Charts ────────────────────────────────────────────────────────────────────
let chartBP, chartSugar, chartBMI, chartOther;

function buildCharts(v) {
  const sys = v.bp_systolic || null;
  const dia = v.bp_diastolic || null;
  const sug = v.blood_sugar || null;
  const bmi = v.bmi_value || autoBMI(v.weight_kg, v.height_cm);
  const temp = v.temperature || null;
  const pulse = v.pulse || null;

  setEl('bpLabel', sys && dia ? `${sys}/${dia} mmHg — ${bpCat(sys, dia)}` : 'Not entered');
  setEl('sugarLabel', sug ? sugarCat(sug) : 'Not entered');
  setEl('bmiLabel', bmi ? bmiCat(bmi) : 'Not entered');

  // BP — horizontal bar
  chartBP?.destroy();
  chartBP = new Chart(document.getElementById('chartBP'), {
    type: 'bar',
    data: {
      labels: ['Systolic', 'Diastolic', 'Norm Sys', 'Norm Dia'],
      datasets: [{
        label: 'mmHg', data: [sys, dia, 120, 80],
        backgroundColor: [
          sys > 140 ? '#ef4444' : sys > 130 ? '#f59e0b' : '#22c55e',
          dia > 90 ? '#ef4444' : dia > 80 ? '#f59e0b' : '#22c55e',
          'rgba(59,130,246,.25)', 'rgba(59,130,246,.25)',
        ],
        borderRadius: 6
      }],
    },
    options: {
      indexAxis: 'y',
      plugins: { legend: { display: false } },
      scales: { x: { min: 0, max: 200, grid: { color: 'rgba(255,255,255,.06)' } }, y: { grid: { display: false } } },
    },
  });

  // Sugar gauge
  chartSugar?.destroy();
  chartSugar = new Chart(document.getElementById('chartSugar'), {
    type: 'doughnut',
    data: {
      datasets: [{
        data: [sug || 0, Math.max(350 - (sug || 0), 0)],
        backgroundColor: [sugarColor(sug), 'rgba(255,255,255,.05)'],
        borderWidth: 0, circumference: 270, rotation: -135
      }]
    },
    options: { cutout: '72%', plugins: { legend: { display: false }, tooltip: { enabled: false } } },
    plugins: [gaugeTextPlugin(sug ? sug + ' mg/dL' : '—')],
  });

  // BMI gauge
  chartBMI?.destroy();
  chartBMI = new Chart(document.getElementById('chartBMI'), {
    type: 'doughnut',
    data: {
      datasets: [{
        data: [bmi || 0, Math.max(45 - (bmi || 0), 0)],
        backgroundColor: [bmiColor(bmi), 'rgba(255,255,255,.05)'],
        borderWidth: 0, circumference: 270, rotation: -135
      }]
    },
    options: { cutout: '72%', plugins: { legend: { display: false }, tooltip: { enabled: false } } },
    plugins: [gaugeTextPlugin(bmi ? String(bmi) : '—')],
  });

  // Temp + Pulse bar
  chartOther?.destroy();
  chartOther = new Chart(document.getElementById('chartOther'), {
    type: 'bar',
    data: {
      labels: ['Temp °C', 'Pulse bpm', 'Norm Temp', 'Norm Pulse'],
      datasets: [{
        label: 'Value', data: [temp, pulse, 37, 72],
        backgroundColor: [
          temp && temp > 38 ? '#ef4444' : '#22c55e',
          pulse && (pulse > 100 || pulse < 60) ? '#f59e0b' : '#22c55e',
          'rgba(59,130,246,.25)', 'rgba(59,130,246,.25)',
        ], borderRadius: 6
      }],
    },
    options: {
      plugins: { legend: { display: false } },
      scales: { y: { grid: { color: 'rgba(255,255,255,.06)' } }, x: { grid: { display: false } } }
    },
  });
}

function gaugeTextPlugin(label) {
  return {
    id: 'g', afterDraw(chart) {
      const { ctx, chartArea: { top, bottom, left, right } } = chart;
      ctx.save();
      ctx.fillStyle = '#e6edf3';
      ctx.font = 'bold 18px Inter';
      ctx.textAlign = 'center';
      ctx.fillText(label, (left + right) / 2, (top + bottom) / 2 + 8);
      ctx.restore();
    }
  };
}

// ── Transcript ────────────────────────────────────────────────────────────────
async function fetchAndRenderTranscript() {
  try {
    const res = await fetch(`${API}/api/v1/chat/history/${convId}`);
    if (!res.ok) return;
    const data = await res.json();
    const turns = data.turns || [];
    document.getElementById('convList').innerHTML = turns.length
      ? turns.map(t => `
          <div class="ct-turn ${t.speaker}">
            <div class="ct-speaker">${t.speaker === 'patient' ? '🙋 Patient' : '🤖 NurseBot'}</div>
            <div class="ct-text">${esc(t.text)}</div>
          </div>`).join('')
      : '<p style="color:var(--muted);padding:12px">No conversation turns found.</p>';
  } catch (e) { /* non-critical */ }
}

// ── Save Recommendation ───────────────────────────────────────────────────────
async function saveRecommendation() {
  const fuRad = document.querySelector('input[name="fu"]:checked');
  const notes = document.getElementById('doctorNotes').value;
  const payload = {
    conversation_id: convId,
    doctor_notes: notes,
    follow_up_days: fuRad ? parseInt(fuRad.value) : null,
    need_prescription: document.getElementById('cbPrescription').checked,
    refer_specialist: document.getElementById('cbSpecialist').checked,
    lab_tests: document.getElementById('cbLabTests').checked,
    diet_advice: document.getElementById('cbDiet').checked,
    exercise_advice: document.getElementById('cbExercise').checked,
    follow_up_date: document.getElementById('fuDate').value || null,
  };
  try {
    const res = await fetch(`${API}/api/v1/report/recommendation`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    setEl('saveStatus', '✓ Saved');
    showToast('Recommendation saved successfully', 'success');
    setTimeout(() => setEl('saveStatus', ''), 3000);
  } catch (e) { showToast('Save failed: ' + e.message, 'error'); }
}

// ── PDF Save ──────────────────────────────────────────────────────────────────
function savePDF() {
  // Preload print-only elements
  setEl('printedNotes', document.getElementById('doctorNotes').value || 'None');
  document.getElementById('printedNotes').classList.remove('hidden');

  const actions = [];
  if (document.getElementById('cbPrescription').checked) actions.push('Issue Prescription');
  if (document.getElementById('cbSpecialist').checked) actions.push('Refer Specialist');
  if (document.getElementById('cbLabTests').checked) actions.push('Order Lab Tests');
  if (document.getElementById('cbDiet').checked) actions.push('Diet Advice');
  if (document.getElementById('cbExercise').checked) actions.push('Exercise Plan');
  setEl('printedActions', actions.join(' | ') || 'None');
  document.getElementById('printedActions').classList.remove('hidden');

  const fuRad = document.querySelector('input[name="fu"]:checked');
  const fuDate = document.getElementById('fuDate').value;
  const fuTxt = fuRad && fuRad.value !== '0'
    ? `Follow-up in ${fuRad.value} days` + (fuDate ? ' — ' + fuDate : '')
    : 'No follow-up scheduled';
  setEl('printedFollowup', fuTxt);
  document.getElementById('printedFollowup').classList.remove('hidden');

  window.print();
  showToast('Print dialog opened — choose "Save as PDF"', 'success');
}

// ── Save Local Files ──────────────────────────────────────────────────────────
async function saveLocalFiles() {
  const btn = event.currentTarget;
  btn.textContent = '⏳ Saving…'; btn.disabled = true;
  try {
    const res = await fetch(`${API}/api/v1/report/export/${convId}`, { method: 'POST' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    showToast(`✓ Files saved to:\n${data.folder}`, 'success');
  } catch (e) {
    showToast('Export error: ' + e.message, 'error');
  } finally {
    btn.textContent = '📁 Save All Files'; btn.disabled = false;
  }
}

// ── Listen TTS ────────────────────────────────────────────────────────────────
async function listenConversation() {
  const btn = document.getElementById('listenBtn');
  // Stop if playing
  if (listenAudio && !listenAudio.paused) {
    listenAudio.pause();
    btn.textContent = '🔊 Listen';
    btn.classList.remove('playing');
    return;
  }
  btn.textContent = '⏳ Loading…';
  btn.classList.add('playing');
  try {
    const res = await fetch(`${API}/api/v1/report/listen/${convId}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Audio fetch failed' }));
      throw new Error(err.error || 'HTTP ' + res.status);
    }
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('audio')) {
      throw new Error('Server did not return audio. Ensure the conversation has at least one turn.');
    }
    const blob = await res.blob();
    listenAudio = new Audio(URL.createObjectURL(blob));
    listenAudio.play();
    btn.textContent = '⏸ Pause';
    listenAudio.onended = () => {
      btn.textContent = '🔊 Listen';
      btn.classList.remove('playing');
    };
  } catch (e) {
    btn.textContent = '🔊 Listen';
    btn.classList.remove('playing');
    showToast('Listen error: ' + e.message, 'error');
  }
}

// ── Category helpers ──────────────────────────────────────────────────────────
function autoBMI(w, h) { return w && h && h > 0 ? +(w / ((h / 100) ** 2)).toFixed(1) : null; }
function bpCat(s, d) { if (!s || !d) return '—'; if (s < 120 && d < 80) return 'Normal'; if (s < 130) return 'Elevated'; if (s < 140) return 'High St.1'; return 'High St.2'; }
function bpCls(s) { return !s ? '' : s > 140 ? 'err' : s > 130 ? 'warn' : 'ok'; }
function sugarCat(v) { if (!v) return '—'; if (v < 70) return 'Low'; if (v <= 99) return 'Normal'; if (v <= 125) return 'Pre-diab.'; return 'Diabetic'; }
function sugarCls(v) { return !v ? '' : v > 125 ? 'err' : v > 99 || v < 70 ? 'warn' : 'ok'; }
function sugarColor(v) { return !v ? 'rgba(100,100,100,.3)' : v > 125 ? '#ef4444' : v > 99 || v < 70 ? '#f59e0b' : '#22c55e'; }
function bmiCat(v) { if (!v) return '—'; if (v < 18.5) return 'Underweight'; if (v < 25) return 'Normal'; if (v < 30) return 'Overweight'; return 'Obese'; }
function bmiCls(v) { return !v ? '' : v > 30 ? 'err' : v > 25 || v < 18.5 ? 'warn' : 'ok'; }
function bmiColor(v) { return !v ? 'rgba(100,100,100,.3)' : v > 30 ? '#ef4444' : v > 25 || v < 18.5 ? '#f59e0b' : '#22c55e'; }

function urgencyEl(id, u) {
  const el = document.getElementById(id); if (!el) return;
  const m = { emergency: '🚨 Emergency', urgent: '⚠ Urgent', routine: '✅ Routine' };
  el.textContent = m[u] || u || '—';
  el.className = 'meta-chip urgency-chip' + (u === 'emergency' ? ' emergency' : u === 'urgent' ? ' urgent' : '');
}
function riskEl(id, r) {
  const el = document.getElementById(id); if (!el) return;
  el.textContent = '🎯 Risk: ' + (r || '—').charAt(0).toUpperCase() + (r || '').slice(1);
  el.className = 'meta-chip risk-chip risk-' + r;
}

// ── Utils ─────────────────────────────────────────────────────────────────────
function showSec(id) { document.getElementById(id)?.classList.remove('hidden'); }
function setEl(id, val) { const el = document.getElementById(id); if (el) el.textContent = val; }
function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

function showToast(msg, type = '') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = `toast${type ? ' ' + type : ''}`;
  t.classList.remove('hidden');
  setTimeout(() => t.classList.add('hidden'), 4000);
}
