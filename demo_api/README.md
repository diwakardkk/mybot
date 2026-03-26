# Demo Chat API

This folder contains a backend-only FastAPI service extracted from the project logic so you can use the chatbot brain on your website without shipping the original UI.

## What it does

- Loads the hospital knowledge base from `data/source_json/hospital_knowledge.json`
- Builds or loads a FAISS vector store
- Accepts website chat messages through a simple `/chat` endpoint
- Keeps short in-memory conversation history per `session_id`
- Returns the answer plus retrieved source snippets for demo display

## Folder structure

```text
demo_api/
  app/
    config.py
    main.py
    models.py
    service.py
    sessions.py
  .env.example
  requirements.txt
```

## Quick start

```bash
cd demo_api
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
```

Add your OpenAI key in `.env`, then run:

```bash
uvicorn app.main:app --host 0.0.0.0 --port 8010 --reload
```

Open:

- `http://localhost:8010/docs`
- `http://localhost:8010/health`

## Environment variables

| Variable | Description |
|---|---|
| `OPENAI_API_KEY` | Required OpenAI API key |
| `OPENAI_CHAT_MODEL` | Chat model for answers |
| `OPENAI_EMBEDDING_MODEL` | Embedding model for FAISS |
| `KNOWLEDGE_BASE_PATH` | Source JSON path |
| `VECTOR_STORE_PATH` | Folder where FAISS index is stored |
| `CORS_ORIGINS` | Comma-separated origins or `*` |
| `MAX_HISTORY_MESSAGES` | Number of past turns kept in memory |

## API

### `POST /chat`

Request:

```json
{
  "message": "I have fever and cough for 3 days",
  "session_id": "optional-session-id",
  "top_k": 4
}
```

Response:

```json
{
  "session_id": "generated-or-reused-id",
  "answer": "....",
  "sources": [
    {
      "title": "Fever Assessment Protocol",
      "category": "fever",
      "excerpt": "Fever is defined as..."
    }
  ]
}
```

### `POST /sessions/reset`

Clears in-memory chat history for a session.

### `POST /admin/rebuild`

Rebuilds the FAISS vector store from the JSON knowledge base.

## Next.js demo usage

Client-side example:

```ts
const res = await fetch("http://localhost:8010/chat", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    message: input,
    session_id: sessionId,
  }),
});

const data = await res.json();
```

Next.js route proxy example:

```ts
export async function POST(req: Request) {
  const body = await req.json();

  const res = await fetch("http://localhost:8010/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  return Response.json(await res.json());
}
```

## Firebase logging example

```ts
import { addDoc, collection } from "firebase/firestore";
import { db } from "@/lib/firebase";

await addDoc(collection(db, "chat_logs"), {
  session_id: data.session_id,
  question: input,
  answer: data.answer,
  sources: data.sources,
  created_at: new Date(),
});
```

## GitHub push steps

After reviewing the changes:

```bash
git add demo_api
git commit -m "Add standalone demo chat API"
git push origin <your-branch>
```
