/* ─────────────────────────────────────────────────────────────────────────────
   Hospital Intake Bot — app.js
   Flow: Welcome → Vitals Step → Chat → End & Generate Report
───────────────────────────────────────────────────────────────────────────── */
const API = '';
let conversationId = null;
let voiceMode = false;
let questionsAsked = 0;
let isRecording = false;
let mediaRecorder = null, audioChunks = [];
let listenAudio = null;
let pendingVitals = null;  // stored until session starts

// ── Vitals Step ───────────────────────────────────────────────────────────────

function goToVitalsStep() {
  document.getElementById('welcomeScreen').classList.add('hidden');
  document.getElementById('vitalsStep').classList.remove('hidden');
  setStatus('Enter patient vitals…');
}

function skipVitals() {
  pendingVitals = null;
  startSession();
}

async function startSessionFromVitals() {
  // Collect vitals
  const sys = numVal('vBpSys'), dia = numVal('vBpDia');
  const sug = numVal('vSugar'), wt = numVal('vWeight');
  const ht = numVal('vHeight'), temp = numVal('vTemp');
  const pulse = numVal('vPulse');
  pendingVitals = {
    bp_systolic: sys, bp_diastolic: dia, blood_sugar: sug,
    weight_kg: wt, height_cm: ht, temperature: temp, pulse
  };
  await startSession();
}

// ── Session Start ─────────────────────────────────────────────────────────────
async function startSession() {
  voiceMode = document.getElementById('voiceToggle').checked;
  const name = document.getElementById('patientName').value.trim() || null;
  const btn = document.getElementById('startBtn');
  btn.disabled = true;
  setStatus('Starting session…');

  try {
    const res = await fetch(`${API}/api/v1/chat/start`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ patient_name: name, language: 'en', voice_mode: voiceMode }),
    });
    const data = await res.json();
    conversationId = data.conversation_id;

    // Hide vitals step, show chat
    document.getElementById('vitalsStep').classList.add('hidden');
    document.getElementById('messages').style.display = 'flex';
    document.getElementById('messages').style.flexDirection = 'column';
    document.getElementById('messages').style.gap = '14px';
    document.getElementById('patientForm').classList.add('hidden');
    document.getElementById('sessionInfo').classList.remove('hidden');
    document.getElementById('inputArea').style.display = 'block';
    if (voiceMode) document.getElementById('voiceIndicator').classList.remove('hidden');

    document.getElementById('sidePatientName').textContent = name || 'Anonymous';
    updateState(data.state);
    setStatus('Session active');

    appendMessage('bot', data.greeting);
    if (voiceMode) await speak(data.greeting);

    // Save vitals if entered
    if (pendingVitals) {
      const anyFilled = Object.values(pendingVitals).some(v => v !== null);
      if (anyFilled) {
        await fetch(`${API}/api/v1/report/vitals`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ conversation_id: conversationId, ...pendingVitals }),
        });
      }
    }
  } catch (e) {
    showToast('Could not connect to server. Is the backend running?', 'error');
    btn.disabled = false;
    setStatus('Error');
  }
}

// ── BMI Auto-Calculate ────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  ['vWeight', 'vHeight'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', updateBMI);
  });
});

function updateBMI() {
  const wt = parseFloat(document.getElementById('vWeight')?.value);
  const ht = parseFloat(document.getElementById('vHeight')?.value);
  const disp = document.getElementById('bmiDisplay');
  const cat = document.getElementById('bmiCat');
  if (!disp || !cat) return;
  if (wt > 0 && ht > 0) {
    const bmi = +(wt / ((ht / 100) ** 2)).toFixed(1);
    disp.textContent = bmi;
    const [label, color] = bmi < 18.5 ? ['Underweight', '#f59e0b']
      : bmi < 25 ? ['Normal', '#22c55e'] : bmi < 30 ? ['Overweight', '#f59e0b'] : ['Obese', '#ef4444'];
    cat.textContent = label;
    cat.style.color = color;
  } else {
    disp.textContent = '—';
    cat.textContent = '';
  }
}

// ── Chat ──────────────────────────────────────────────────────────────────────
async function sendMessage(textOverride) {
  if (!conversationId) return;
  const input = document.getElementById('msgInput');
  const text = textOverride || input.value.trim();
  if (!text) return;
  input.value = ''; autoResize(input);
  appendMessage('user', text);
  showTyping();
  setStatus('Thinking…');

  try {
    const res = await fetch(`${API}/api/v1/chat/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Conversation-Id': conversationId },
      body: JSON.stringify({ conversation_id: conversationId, message: text }),
    });
    const data = await res.json();
    hideTyping();
    appendMessage('bot', data.response, data.is_emergency);
    updateState(data.state);
    if (data.next_question) { questionsAsked++; updateProgress(); }
    if (data.is_emergency) document.getElementById('emergencyBanner').classList.remove('hidden');
    setStatus(data.state === 'closed' ? 'Intake complete' : 'Listening…');
    if (voiceMode) await speak(data.response);
  } catch (e) {
    hideTyping();
    showToast('Could not reach server. Please try again.', 'error');
    setStatus('Error');
  }
}

// ── End Session & Open Report ─────────────────────────────────────────────────
async function endAndReport() {
  if (!conversationId) return;
  setStatus('Generating report…');
  // Export to local folder
  try {
    await fetch(`${API}/api/v1/report/export/${conversationId}`, { method: 'POST' });
  } catch (e) { /* non-critical */ }
  openReport();
  showToast('✓ Report generated & saved locally', 'success');
}

function openReport() {
  if (!conversationId) return;
  window.open(`/report?id=${conversationId}`, '_blank');
}

// ── Message Rendering ─────────────────────────────────────────────────────────
function appendMessage(role, text, emergency = false) {
  const cont = document.getElementById('messages');
  const wrap = document.createElement('div');
  wrap.className = `msg ${role}${emergency ? ' emergency' : ''}`;
  const avatar = document.createElement('div');
  avatar.className = 'msg-avatar';
  avatar.textContent = role === 'user' ? '🙋' : '🤖';
  const inner = document.createElement('div');
  const bubble = document.createElement('div');
  bubble.className = 'msg-bubble';
  bubble.textContent = text;
  const time = document.createElement('div');
  time.className = 'msg-time';
  time.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  inner.append(bubble, time);
  wrap.append(avatar, inner);
  cont.appendChild(wrap);
  scrollBottom();
}

let typingEl = null;
function showTyping() {
  if (typingEl) return;
  const cont = document.getElementById('messages');
  typingEl = document.createElement('div');
  typingEl.className = 'msg bot';
  typingEl.innerHTML = `<div class="msg-avatar">🤖</div>
    <div class="msg-bubble typing-indicator" style="display:flex;gap:5px;padding:14px 18px">
      <div class="dot-bounce"></div><div class="dot-bounce"></div><div class="dot-bounce"></div>
    </div>`;
  cont.appendChild(typingEl);
  scrollBottom();
}
function hideTyping() { if (typingEl) { typingEl.remove(); typingEl = null; } }

// ── Helpers ───────────────────────────────────────────────────────────────────
function scrollBottom() { const b = document.getElementById('chatBody'); b.scrollTop = b.scrollHeight; }
function setStatus(msg) { document.getElementById('statusText').textContent = msg; }
function updateState(state) { document.getElementById('sideState').textContent = (state || '').replace('_', ' '); }
function updateProgress() {
  const pct = Math.min((questionsAsked / 7) * 100, 100);
  document.getElementById('progressBar').style.width = pct + '%';
  document.getElementById('progressLabel').textContent = `${questionsAsked}/7`;
}
function handleKey(e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }
function autoResize(el) { el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 160) + 'px'; }
function numVal(id) { const v = parseFloat(document.getElementById(id)?.value); return isNaN(v) ? null : v; }

function showToast(msg, type = '') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = `toast${type ? ' ' + type : ''}`;
  t.classList.remove('hidden');
  setTimeout(() => t.classList.add('hidden'), 3500);
}

// ── Continuous Voice Mode (VAD) ───────────────────────────────────────────────
let audioCtx = null;
let analyser = null;
let vadStream = null;
let vadAnimId = null;
let currentTTS = null;   // current playing Audio object
let voiceLoop = false;  // is the continuous loop active?
const SILENCE_THRESHOLD = 8;   // RMS level below which we consider silence
const SILENCE_DELAY_MS = 1800; // ms of silence before auto-stop

// One-click toggle for mic
async function toggleMic() {
  if (voiceLoop) {
    stopVoiceLoop();
  } else {
    startVoiceLoop();
  }
}

function stopVoiceLoop() {
  voiceLoop = false;
  stopCurrentTTS();
  stopRecordingVAD();
  document.getElementById('micBtn').classList.remove('recording');
  setStatus('Voice mode stopped');
}

async function startVoiceLoop() {
  if (!conversationId) return;
  voiceLoop = true;
  document.getElementById('micBtn').classList.add('recording');
  await listenOnce();
}

// One full cycle: listen → detect silence → send STT → bot reply → speak → repeat
async function listenOnce() {
  if (!voiceLoop) return;
  setStatus('🎙️ Listening…');
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    vadStream = stream;

    // Setup AudioContext for volume analysis
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 512;
    const src = audioCtx.createMediaStreamSource(stream);
    src.connect(analyser);

    audioChunks = [];
    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus' : 'audio/webm';
    mediaRecorder = new MediaRecorder(stream, { mimeType });
    mediaRecorder.ondataavailable = e => { if (e.data.size > 0) audioChunks.push(e.data); };
    mediaRecorder.start(100); // collect in 100ms chunks
    isRecording = true;

    // VAD: watch for voice start then silence
    await waitForSpeechThenSilence();

    // Stop recording
    await stopRecordingVAD();

    if (!voiceLoop) return;

    // Send to STT → bot reply → TTS
    if (audioChunks.length > 0) {
      setStatus('Processing speech…');
      const transcript = await transcribeAudio();
      if (transcript) {
        await sendMessage(transcript);
      } else {
        setStatus('Could not hear clearly — listening again…');
      }
    }

    // Loop again after TTS finishes (or is interrupted)
    if (voiceLoop) {
      await listenOnce();
    }
  } catch (e) {
    console.error('VAD error:', e);
    showToast('Microphone error: ' + e.message, 'error');
    stopVoiceLoop();
  }
}

// Returns a promise that resolves once we hear speech then detect silence
function waitForSpeechThenSilence() {
  const data = new Uint8Array(analyser.frequencyBinCount);
  let speechDetected = false;
  let silenceStart = null;

  return new Promise(resolve => {
    function tick() {
      if (!voiceLoop) { resolve(); return; }
      analyser.getByteTimeDomainData(data);
      // Compute RMS level
      let sum = 0;
      for (let i = 0; i < data.length; i++) {
        const v = (data[i] - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / data.length) * 100;

      if (rms > SILENCE_THRESHOLD) {
        speechDetected = true;
        silenceStart = null;
        setStatus('🎙️ Listening… (speaking detected)');
      } else if (speechDetected) {
        if (!silenceStart) silenceStart = Date.now();
        const elapsed = Date.now() - silenceStart;
        const pct = Math.min((elapsed / SILENCE_DELAY_MS) * 100, 100);
        setStatus(`🤫 Silence detected… sending in ${Math.ceil((SILENCE_DELAY_MS - elapsed) / 1000)}s`);
        if (elapsed >= SILENCE_DELAY_MS) { resolve(); return; }
      }
      vadAnimId = requestAnimationFrame(tick);
    }
    tick();
  });
}

function stopRecordingVAD() {
  return new Promise(resolve => {
    if (vadAnimId) { cancelAnimationFrame(vadAnimId); vadAnimId = null; }
    if (audioCtx) { audioCtx.close().catch(() => { }); audioCtx = null; }
    if (isRecording && mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.onstop = resolve;
      mediaRecorder.stop();
      if (vadStream) { vadStream.getTracks().forEach(t => t.stop()); vadStream = null; }
      isRecording = false;
    } else {
      if (vadStream) { vadStream.getTracks().forEach(t => t.stop()); vadStream = null; }
      resolve();
    }
  });
}

function stopCurrentTTS() {
  if (currentTTS) {
    currentTTS.pause();
    currentTTS.src = '';
    currentTTS = null;
  }
}

async function transcribeAudio() {
  const blob = new Blob(audioChunks, { type: 'audio/webm' });
  const form = new FormData();
  form.append('audio', blob, 'recording.webm');
  try {
    const res = await fetch(`${API}/api/v1/stt/transcribe`, { method: 'POST', body: form });
    const data = await res.json();
    return data.transcript?.trim() || null;
  } catch (e) {
    console.error('STT error:', e);
    return null;
  }
}

// ── TTS ───────────────────────────────────────────────────────────────────────
async function speak(text) {
  if (!voiceMode) return;
  stopCurrentTTS(); // stop any previous audio
  try {
    const res = await fetch(`${API}/api/v1/tts/speak`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    const blob = await res.blob();
    const audio = new Audio(URL.createObjectURL(blob));
    currentTTS = audio;
    setStatus('🤖 Speaking…');
    await new Promise(resolve => {
      audio.onended = resolve;
      audio.onerror = resolve;
      audio.play().catch(resolve);
    });
    currentTTS = null;
  } catch (e) { console.warn('TTS:', e); }
}
