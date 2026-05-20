# ZeptAI — AI-Powered Healthcare Patient Intake Platform

> **ZeptAI** is a full-stack healthcare SaaS product that provides an AI-powered patient intake assistant, secure medical report storage, and structured clinical summaries — designed for clinics, hospitals, and telemedicine platforms.

---

## Features

| Feature | Description |
|---|---|
| 🤖 AI Intake Chatbot | GPT-4o-powered conversational intake with RAG knowledge base |
| 🔐 Firebase Auth | Email/password, Mobile OTP, Google Sign-In |
| 👤 Patient Profiles | Unique ZPT-YYYYMMDD-XXXXXX patient IDs stored in Firestore |
| 📂 Medical Reports | Drag-and-drop upload to Firebase Storage with AES-GCM encryption |
| 📊 Clinical Reports | AI-generated intake summaries with vitals, recommendations, PDF print |
| 🎙️ Voice Input | Whisper-powered speech-to-text |
| 🔊 Voice Output | OpenAI TTS read-back |
| 📱 PWA Ready | Installable on Android/iOS with offline shell cache |

---

## Tech Stack

- **Backend**: Python 3.11+ · FastAPI · SQLite · OpenAI GPT-4o · Whisper · Chroma RAG
- **Frontend**: Vanilla JS (ES2020) · Firebase Web SDK v10 (compat mode) · Progressive Web App
- **Auth**: Firebase Authentication (email/password · phone OTP · Google)
- **Database**: Firestore (patient profiles) · SQLite (sessions, turns, vitals)
- **Storage**: Firebase Storage (medical reports, AES-GCM encrypted)
- **Container**: Docker · GitHub Actions CI

---

## Quick Start (Local Development)

### 1. Clone & environment

```bash
git clone <your-repo>
cd demo_final/mybot
cp .env.example .env          # fill in your keys
pip install -r requirements.txt
```

### 2. Required environment variables (`.env`)

```dotenv
# OpenAI
OPENAI_API_KEY=sk-...

# Firebase Admin (optional — set false for local dev)
FIREBASE_ADMIN_ENABLED=false
FIREBASE_PROJECT_ID=your-project-id
GOOGLE_APPLICATION_CREDENTIALS=path/to/serviceAccount.json
```

### 3. Run the server

```bash
cd /path/to/demo_final
PYTHONPATH=/path/to/demo_final/mybot \
  python3 -m uvicorn app.main:app \
    --host 127.0.0.1 --port 8000 \
    --app-dir /path/to/demo_final/mybot
```

Then open **http://127.0.0.1:8000**

---

## Firebase Setup (Required for Auth)

1. Go to [Firebase Console](https://console.firebase.google.com/) → Create a project
2. Enable **Authentication** → Sign-in methods: Email/Password, Phone, Google
3. Enable **Cloud Firestore** → Start in production mode
4. Enable **Storage** → Start in production mode
5. Copy your web app config from Project Settings → paste into `mybot/frontend/firebase-config.js`

### Deploy Security Rules

```bash
npm install -g firebase-tools
firebase login
firebase init  # select Firestore + Storage
firebase deploy --only firestore:rules,storage:rules
```

Rule files:
- `mybot/firebase/firestore.rules`
- `mybot/firebase/storage.rules`

---

## Docker

```bash
cd mybot
docker build -t zeptai-backend .
docker run -p 8000:8000 \
  -e OPENAI_API_KEY=sk-... \
  zeptai-backend
```

---

## Project Structure

```
mybot/
├── app/
│   ├── main.py            # FastAPI app (routes /, /auth, /dashboard, /profile, /intake, /reports)
│   ├── api/               # REST API routes (chat, sessions, report, stt, tts, admin)
│   ├── core/              # Config, logging, prompts, security, firebase_admin
│   ├── db/                # SQLite repos (sessions, turns, vitals, audit)
│   ├── models/            # Pydantic models
│   ├── rag/               # Chroma vectorstore + chunker + retriever
│   └── services/          # Business logic
├── frontend/
│   ├── index.html         # Landing page
│   ├── auth.html/css/js   # Login / Sign-up
│   ├── dashboard.html/css/js
│   ├── profile.html/css/js
│   ├── intake.html        # AI chatbot (protected)
│   ├── reports.html/css/js
│   ├── report.html/css/js # Printable intake summary
│   ├── firebase-config.js # 🔑 Replace with your Firebase credentials
│   ├── firebase-service.js
│   ├── auth-guard.js
│   ├── crypto-utils.js    # AES-GCM browser encryption
│   ├── manifest.json      # PWA
│   └── service-worker.js
├── firebase/
│   ├── firestore.rules
│   └── storage.rules
└── data/
    └── source_json/       # RAG knowledge base
```

---

## Pages & Routes

| Route | Page | Auth Required |
|---|---|---|
| `/` | Landing page | No |
| `/auth` | Login / Sign-up | No (redirects if logged in) |
| `/dashboard` | Patient dashboard | Yes |
| `/profile` | Profile editor | Yes |
| `/intake` | AI chatbot intake | Yes |
| `/reports` | Medical report upload | Yes |
| `/report?id=…` | Printable report | No |

---

## Security Notes

- Medical reports are optionally encrypted with AES-GCM in the browser before upload (enable via `window.ENCRYPTION_ENABLED = true`)
- Firestore and Storage rules enforce per-user ownership — no cross-patient data access
- Firebase ID tokens can be verified server-side by setting `FIREBASE_ADMIN_ENABLED=true`
- All API endpoints are guarded by CORS and optionally by Firebase token via `deps_auth.py`
- Patient data never leaves the user's Firebase project

---

## Converting to Mobile (Android / iOS)

Since the frontend is a standard PWA:

- **Android**: Use [Capacitor](https://capacitorjs.com/) or [TWA (Trusted Web Activity)](https://developer.chrome.com/docs/android/trusted-web-activity/)
- **iOS**: Use [Capacitor](https://capacitorjs.com/) — wraps the same HTML/JS/CSS into a native app shell

No frontend rewrite required.

---

## License

Proprietary — ZeptAI Healthcare Platform. All rights reserved.
