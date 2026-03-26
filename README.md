# Hospital Intake Bot — NurseBot AI

An AI-powered hospital intake assistant built with FastAPI, LangChain, OpenAI GPT-4o, and a modern dark-mode web UI. Patients complete a structured intake form via voice or text chat; doctors receive a GPT-refined clinical report with vitals charts and recommendations.

## Features

- Voice & Text Chat — STT (Whisper or faster-whisper) + TTS (OpenAI or Piper)
- Vitals Input — BP, Sugar, Weight, Height, BMI (auto-calc), Temp, Pulse
- AI Analysis — clinical reasoning with risk levels, key findings, red flags
- GPT-Refined Report — polished professional language
- PDF Export — browser print
- Local File Save — conversation JSON + report JSON
- Listen — TTS playback of full conversation
- SQLite persistence + FAISS RAG over hospital knowledge

## Quick Start (local)

```bash
# 1. Clone
git clone https://github.com/YOUR_USERNAME/nurse-bot.git
cd nurse-bot

# 2. Install dependencies (backend)
cd backend
pip install -r requirements.txt

# 3. Set up environment
cp .env.example .env
# Edit backend/.env and add your OPENAI_API_KEY

# 4. Build the knowledge base (first time only)
python -c "from app.rag.vectorstore import build_vectorstore; build_vectorstore()"

# 5. Run backend
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Open http://localhost:8000 (frontend is served by the backend).

## Project Structure

```
nurse-bot/
├── backend/
│   ├── app/                  # FastAPI backend package
│   │   ├── api/routes/       # chat, report, STT, TTS
│   │   ├── core/             # config, logging, prompts, security
│   │   ├── db/               # SQLAlchemy ORM, session & conversation repos
│   │   ├── models/           # Pydantic models
│   │   ├── rag/              # FAISS ingestion, chunking, embedding, retrieval
│   │   └── services/         # conversation, extraction, report, TTS, STT
│   ├── data/                 # vector store, audio, knowledge base
│   │   └── source_json/hospital_knowledge.json
│   ├── patient_data/         # exported conversations/reports
│   ├── requirements.txt
│   ├── .env.example / .env   # backend configuration
│   ├── Dockerfile            # container build
│   ├── Procfile              # process definition
│   └── railway.toml          # Railway config
├── frontend/                 # static web client
│   ├── index.html / app.js / style.css
│   └── report.html / report.js / report.css
└── README.md
```

## Environment Variables (backend/.env)

| Variable | Description |
|---|---|
| `OPENAI_API_KEY` | Your OpenAI API key (required) |
| `DATABASE_URL` | SQLite path (default: `sqlite:///./data/nurse_bot.db`) |
| `OPENAI_CHAT_MODEL` | Model name (default: `gpt-4o`) |
| `OPENAI_TTS_VOICE` | TTS voice (default: `alloy`) |
| `STT_BACKEND` | `openai` or `faster_whisper` |
| `TTS_BACKEND` | `openai` or `piper` |

## Deploy (container)

Build context: repository root.
```
docker build -t nurse-bot -f backend/Dockerfile .
docker run -p 8000:8000 --env-file backend/.env nurse-bot
```
