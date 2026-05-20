/* ─────────────────────────────────────────────────────────────────────────────
   Hospital Intake Bot — report.js  (complete rewrite)
   Handles: data fetching, Chart.js vitals, PDF, local save, listen TTS
───────────────────────────────────────────────────────────────────────────── */
const API = '';
const params = new URLSearchParams(window.location.search);
const convId = params.get('id');
let reportData = null;
let listenAudio = null;

Chart.defaults.color = '#475569';
Chart.defaults.font.family = "'Inter', system-ui, sans-serif";
Chart.defaults.font.size = 11;

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
let chartVitals;

function buildCharts(v) {
  const bmi = v.bmi_value || autoBMI(v.weight_kg, v.height_cm);

  // Each metric: label, unit, current value, scale min/max, normal range, warning threshold
  const metrics = [
    { label: 'Systolic BP',  unit: 'mmHg',  val: v.bp_systolic,  sMin: 0,  sMax: 220, nMin: 90,   nMax: 120,  wHi: 140  },
    { label: 'Diastolic BP', unit: 'mmHg',  val: v.bp_diastolic, sMin: 0,  sMax: 130, nMin: 60,   nMax: 80,   wHi: 90   },
    { label: 'Blood Sugar',  unit: 'mg/dL', val: v.blood_sugar,  sMin: 0,  sMax: 300, nMin: 70,   nMax: 100,  wHi: 126  },
    { label: 'BMI',          unit: '',      val: bmi,            sMin: 10, sMax: 45,  nMin: 18.5, nMax: 25,   wHi: 30   },
    { label: 'Temperature',  unit: '°C',    val: v.temperature,  sMin: 34, sMax: 42,  nMin: 36.1, nMax: 37.2, wHi: 38.5 },
    { label: 'Pulse',        unit: 'bpm',   val: v.pulse,        sMin: 0,  sMax: 180, nMin: 60,   nMax: 100,  wHi: 120  },
  ];

  // Normalise a raw value to 0–100% of the metric's scale
  const pct = (raw, sMin, sMax) =>
    raw != null ? Math.max(0, Math.min(100, ((raw - sMin) / (sMax - sMin)) * 100)) : null;

  const nMinPct = metrics.map(m => pct(m.nMin, m.sMin, m.sMax));
  const nMaxPct = metrics.map(m => pct(m.nMax, m.sMin, m.sMax));
  const wHiPct  = metrics.map(m => pct(m.wHi,  m.sMin, m.sMax));
  const valPcts  = metrics.map(m => pct(m.val,  m.sMin, m.sMax));

  const barColors = metrics.map((m, i) => {
    const v = valPcts[i];
    if (v == null) return 'rgba(148,163,184,.5)';
    if (v <= nMaxPct[i]) return '#16a34a';
    if (v <= wHiPct[i])  return '#d97706';
    return '#dc2626';
  });

  // ── Plugin: draw coloured zone bands behind each bar ──────────────────────
  const zonesPlugin = {
    id: 'vitalsZones',
    beforeDatasetsDraw(chart) {
      const { ctx, chartArea: { top, left, width, height }, scales: { x, y } } = chart;
      const n = metrics.length;
      const toX = p => left + (p / 100) * width;

      metrics.forEach((m, i) => {
        const yC   = y.getPixelForValue(i);
        const slot = height / n;
        const bH   = Math.round(slot * 0.52);
        const yT   = yC - bH / 2;

        // Full track (light gray background)
        ctx.fillStyle = '#f8fafc';
        ctx.fillRect(toX(0), yT, toX(100) - toX(0), bH);

        // Low-side warn band (left of normal)
        if (nMinPct[i] > 0) {
          ctx.fillStyle = 'rgba(217,119,6,.10)';
          ctx.fillRect(toX(0), yT, toX(nMinPct[i]) - toX(0), bH);
        }
        // Normal zone
        ctx.fillStyle = 'rgba(22,163,74,.13)';
        ctx.fillRect(toX(nMinPct[i]), yT, toX(nMaxPct[i]) - toX(nMinPct[i]), bH);
        // Warn zone
        ctx.fillStyle = 'rgba(217,119,6,.10)';
        ctx.fillRect(toX(nMaxPct[i]), yT, toX(wHiPct[i]) - toX(nMaxPct[i]), bH);
        // Critical zone
        ctx.fillStyle = 'rgba(220,38,38,.09)';
        ctx.fillRect(toX(wHiPct[i]), yT, toX(100) - toX(wHiPct[i]), bH);

        // Normal-range border ticks
        [nMinPct[i], nMaxPct[i]].forEach(p => {
          ctx.save();
          ctx.strokeStyle = 'rgba(22,163,74,.45)';
          ctx.lineWidth = 1.5;
          ctx.setLineDash([3, 2]);
          ctx.beginPath();
          ctx.moveTo(toX(p), yT - 2);
          ctx.lineTo(toX(p), yT + bH + 2);
          ctx.stroke();
          ctx.restore();
        });
      });
    },
  };

  // ── Plugin: value labels to the right of each bar ─────────────────────────
  const labelsPlugin = {
    id: 'vitalsLabels',
    afterDatasetsDraw(chart) {
      const { ctx, scales: { x, y } } = chart;
      metrics.forEach((m, i) => {
        if (m.val == null) return;
        const xPos = x.getPixelForValue(valPcts[i]);
        const yPos = y.getPixelForValue(i);
        const valStr = m.val + (m.unit ? '\u202f' + m.unit : '');
        ctx.save();
        ctx.fillStyle = '#0f172a';
        ctx.font = '600 11px Inter, system-ui, sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(valStr, xPos + 8, yPos);
        ctx.restore();
      });
    },
  };

  chartVitals?.destroy();
  chartVitals = new Chart(document.getElementById('chartVitals'), {
    type: 'bar',
    data: {
      labels: metrics.map(m => m.label),
      datasets: [{
        data: valPcts,
        backgroundColor: barColors.map(c => c.startsWith('rgba') ? c : c + 'cc'),
        borderColor:      barColors,
        borderWidth: 1.5,
        borderRadius: 4,
        borderSkipped: false,
        barThickness: 'flex',
        maxBarThickness: 22,
      }],
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 700, easing: 'easeOutQuart' },
      layout: { padding: { right: 82 } },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: items  => metrics[items[0].dataIndex].label,
            label: ctx => {
              const m = metrics[ctx.dataIndex];
              if (m.val == null) return ' No data recorded';
              const vp = valPcts[ctx.dataIndex];
              const status = vp <= nMaxPct[ctx.dataIndex] ? 'Normal'
                           : vp <= wHiPct[ctx.dataIndex]  ? 'Borderline' : 'Abnormal';
              return ` ${m.val}${m.unit ? ' ' + m.unit : ''} — ${status}`;
            },
          },
          backgroundColor: '#1e293b',
          titleColor: '#f1f5f9',
          bodyColor: '#cbd5e1',
          cornerRadius: 6,
          padding: 10,
        },
      },
      scales: {
        x: {
          min: 0, max: 100,
          grid:   { color: 'rgba(0,0,0,.05)', drawTicks: false },
          border: { display: false },
          ticks:  { display: false },
        },
        y: {
          grid:   { display: false },
          border: { display: false },
          ticks:  {
            color: '#334155',
            font:  { size: 12, weight: '600', family: 'Inter, system-ui, sans-serif' },
            padding: 10,
          },
        },
      },
    },
    plugins: [zonesPlugin, labelsPlugin],
  });
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
            <div class="ct-speaker">${t.speaker === 'patient' ? '🙋 Patient' : '🤖 ZeptAI'}</div>
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
