# 🏥 Hospital Intake Bot — NurseBot AI

An AI-powered hospital intake assistant built with FastAPI, LangChain, OpenAI GPT-4o, and a modern dark-mode web UI. Patients complete a structured intake form via voice or text chat; doctors receive a GPT-refined clinical report with vitals charts and recommendations.

## ✨ Features

- 🎙️ **Voice & Text Chat** — STT (Whisper) + TTS (OpenAI)
- 📊 **Vitals Input** — BP, Sugar, Weight, Height, BMI (auto-calc), Temp, Pulse
- 🧠 **AI Analysis** — LangChain-style medical analysis with risk levels, key findings, red flags
- 📝 **GPT-Refined Report** — Same clinical content, polished professional language
- 📄 **PDF Export** — Save report as PDF via browser print
- 💾 **Local File Save** — Exports conversation JSON + report JSON to folder
- 🔊 **Listen** — TTS playback of full conversation
- 🗄️ **SQLite Persistence** — Saves sessions, turns, vitals, recommendations
- 🔍 **RAG** — FAISS vector store over hospital knowledge JSON

## 🚀 Quick Start

```bash
# 1. Clone
git clone https://github.com/YOUR_USERNAME/nurse-bot.git
cd nurse-bot

# 2. Install dependencies
pip install -r requirements.txt

# 3. Set up environment
cp .env.example .env
# Edit .env and add your OPENAI_API_KEY

# 4. Build the knowledge base (first time only)
python -c "from app.rag.vectorstore import build_vectorstore; build_vectorstore()"

# 5. Run
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

Open http://localhost:8000

## 📁 Project Structure

```
nurse-bot/
├── app/
│   ├── api/routes/       # FastAPI routes (chat, report, STT, TTS)
│   ├── core/             # Config, logging, prompts, security
│   ├── db/               # SQLAlchemy ORM, session & conversation repos
│   ├── models/           # Pydantic models
│   ├── rag/              # FAISS ingestion, chunking, embedding, retrieval
│   └── services/         # Conversation, extraction, report, TTS, STT
├── data/
│   ├── seed_questions.json
│   └── source_json/hospital_knowledge.json
├── frontend/
│   ├── index.html        # Chat UI (vitals step + chat)
│   ├── report.html       # Patient report page (charts, PDF)
│   ├── app.js / report.js
│   └── style.css / report.css
├── .env.example
└── requirements.txt
```

## 🔑 Environment Variables

| Variable | Description |
|---|---|
| `OPENAI_API_KEY` | Your OpenAI API key (required) |
| `DATABASE_URL` | SQLite path (default: `sqlite:///./data/nurse_bot.db`) |
| `OPENAI_CHAT_MODEL` | Model name (default: `gpt-4o`) |
| `OPENAI_TTS_VOICE` | TTS voice (default: `alloy`) |

## ☁️ Deploy to Cloud Run

```bash
gcloud run deploy nurse-bot \
  --source . \
  --region europe-west1 \
  --allow-unauthenticated \
  --memory 2Gi \
  --set-env-vars OPENAI_API_KEY=YOUR_KEY
```

## 🛠️ Tech Stack

- **Backend**: FastAPI, SQLAlchemy, LangChain, OpenAI
- **Frontend**: Vanilla HTML/CSS/JS, Chart.js
- **AI**: GPT-4o (chat, extraction, refinement), Whisper (STT), TTS
- **RAG**: FAISS + text-embedding-3-small
- **DB**: SQLite (local) / PostgreSQL (cloud)
