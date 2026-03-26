# MyNurseAPI

Standalone FastAPI service for the NurseBot RAG + conversation logic.

## Structure
```
MyNurseAPI/
+-- app/            # FastAPI application (copied from NurseBot)
+-- data/           # Knowledge base + vectorstore (can be rebuilt)
+-- patient_data/   # Sample exports
+-- requirements.txt
+-- .env.example
```

## Quick start
```bash
python -m venv venv
.\venv\Scripts\pip install -r requirements.txt
cp .env.example .env   # add your keys
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Health check: http://localhost:8000/health
API base: /api/v1/...
