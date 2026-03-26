"""
Text chunker — splits LangChain Documents into smaller overlapping chunks for indexing.
"""
from typing import List
from langchain_core.documents import Document
from langchain_text_splitters import RecursiveCharacterTextSplitter
from app.core.logging import get_logger

logger = get_logger(__name__)

_splitter = RecursiveCharacterTextSplitter(
    chunk_size=512,
    chunk_overlap=64,
    separators=["\n\n", "\n", ". ", " ", ""],
)


def chunk_documents(documents: List[Document]) -> List[Document]:
    """Split documents into smaller chunks preserving metadata."""
    chunks = _splitter.split_documents(documents)
    logger.info(f"Chunked {len(documents)} documents into {len(chunks)} chunks")
    return chunks
