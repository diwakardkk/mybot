from pydantic import BaseModel, Field


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=4000)
    session_id: str | None = None
    top_k: int = Field(default=4, ge=1, le=8)


class ChatSource(BaseModel):
    title: str
    category: str
    excerpt: str


class ChatResponse(BaseModel):
    session_id: str
    answer: str
    sources: list[ChatSource] = Field(default_factory=list)


class ResetSessionRequest(BaseModel):
    session_id: str


class MessageItem(BaseModel):
    role: str
    content: str
