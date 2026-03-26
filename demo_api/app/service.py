import json
import logging
from pathlib import Path

from langchain_community.vectorstores import FAISS
from langchain_core.documents import Document
from langchain_openai import OpenAIEmbeddings
from langchain_text_splitters import RecursiveCharacterTextSplitter
from openai import AsyncOpenAI

from .config import settings
from .models import ChatResponse, ChatSource
from . import sessions


logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """You are a helpful hospital knowledge assistant for a website demo.

Rules:
- Answer using the provided knowledge base context when possible.
- Be clear, calm, and concise.
- If the knowledge base does not support a claim, say you are unsure.
- Do not invent hospital policies, diagnoses, or medications.
- If the user describes a medical emergency, tell them to seek immediate medical help right away.
"""

EMERGENCY_KEYWORDS = [
    "chest pain",
    "can't breathe",
    "cannot breathe",
    "not breathing",
    "unconscious",
    "unresponsive",
    "stroke",
    "seizure",
    "severe bleeding",
    "anaphylaxis",
    "heart attack",
]

_client: AsyncOpenAI | None = None
_embeddings: OpenAIEmbeddings | None = None
_vectorstore: FAISS | None = None


def _get_client() -> AsyncOpenAI:
    global _client
    if _client is None:
        _client = AsyncOpenAI(api_key=settings.openai_api_key)
    return _client


def _get_embeddings() -> OpenAIEmbeddings:
    global _embeddings
    if _embeddings is None:
        _embeddings = OpenAIEmbeddings(
            model=settings.openai_embedding_model,
            openai_api_key=settings.openai_api_key,
        )
    return _embeddings


def _load_documents() -> list[Document]:
    kb_path = Path(settings.knowledge_base_path)
    if not kb_path.exists():
        raise FileNotFoundError(f"Knowledge base file not found: {kb_path}")

    records = json.loads(kb_path.read_text(encoding="utf-8"))
    docs: list[Document] = []
    for record in records:
        title = record.get("title", "").strip()
        content = record.get("content", "").strip()
        docs.append(
            Document(
                page_content=f"{title}\n\n{content}".strip(),
                metadata={
                    "id": record.get("id", ""),
                    "title": title or "Untitled",
                    "category": record.get("category", "general"),
                    "risk_level": record.get("risk_level", "low"),
                    "keywords": record.get("keywords", []),
                },
            )
        )
    return docs


def _chunk_documents(documents: list[Document]) -> list[Document]:
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=512,
        chunk_overlap=64,
        separators=["\n\n", "\n", ". ", " ", ""],
    )
    return splitter.split_documents(documents)


def build_vectorstore(force: bool = False) -> FAISS:
    global _vectorstore
    vector_dir = Path(settings.vector_store_path)
    index_file = vector_dir / "index.faiss"
    embeddings = _get_embeddings()

    if not force and _vectorstore is not None:
        return _vectorstore

    if not force and index_file.exists():
        _vectorstore = FAISS.load_local(
            str(vector_dir),
            embeddings,
            allow_dangerous_deserialization=True,
        )
        return _vectorstore

    documents = _load_documents()
    chunks = _chunk_documents(documents)
    vector_dir.mkdir(parents=True, exist_ok=True)
    _vectorstore = FAISS.from_documents(chunks, embeddings)
    _vectorstore.save_local(str(vector_dir))
    logger.info("Vector store built with %s chunks", len(chunks))
    return _vectorstore


def _retrieve(message: str, top_k: int) -> list[Document]:
    store = build_vectorstore(force=False)
    return store.similarity_search(message, k=top_k)


def _history_text(session_id: str) -> str:
    lines: list[str] = []
    for item in sessions.get_history(session_id):
        label = "User" if item.role == "user" else "Assistant"
        lines.append(f"{label}: {item.content}")
    return "\n".join(lines).strip()


def _sources_from_docs(docs: list[Document]) -> list[ChatSource]:
    sources: list[ChatSource] = []
    for doc in docs:
        content = " ".join(doc.page_content.split())
        sources.append(
            ChatSource(
                title=doc.metadata.get("title", "Untitled"),
                category=doc.metadata.get("category", "general"),
                excerpt=content[:220] + ("..." if len(content) > 220 else ""),
            )
        )
    return sources


def _is_emergency(message: str) -> bool:
    lower = message.lower()
    return any(keyword in lower for keyword in EMERGENCY_KEYWORDS)


async def generate_chat_reply(message: str, session_id: str, top_k: int) -> ChatResponse:
    if _is_emergency(message):
        answer = (
            "Your message may describe an emergency. Please contact emergency services or go to the nearest "
            "hospital immediately."
        )
        sessions.append_message(session_id, "user", message)
        sessions.append_message(session_id, "assistant", answer)
        return ChatResponse(session_id=session_id, answer=answer, sources=[])

    docs = _retrieve(message, top_k=top_k)
    context = "\n\n".join(
        f"[{doc.metadata.get('title', 'Untitled')} | {doc.metadata.get('category', 'general')}]\n{doc.page_content}"
        for doc in docs
    )
    history = _history_text(session_id)

    prompt = f"""Use the knowledge base context and recent conversation to answer the user.

Recent conversation:
{history or "No prior messages."}

Knowledge base context:
{context or "No relevant context found."}

User message:
{message}
"""

    client = _get_client()
    response = await client.chat.completions.create(
        model=settings.openai_chat_model,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": prompt},
        ],
        max_tokens=350,
        temperature=0.2,
    )
    answer = (response.choices[0].message.content or "").strip()
    if not answer:
        answer = "I could not generate a response just now. Please try again."

    sessions.append_message(session_id, "user", message)
    sessions.append_message(session_id, "assistant", answer)
    return ChatResponse(
        session_id=session_id,
        answer=answer,
        sources=_sources_from_docs(docs),
    )
