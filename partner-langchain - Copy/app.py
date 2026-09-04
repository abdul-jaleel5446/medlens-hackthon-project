# MedLens — LangChain Q&A service
#
# Run:      uvicorn app:app --host 0.0.0.0 --port 8000 --reload
# Requires: pip install -r requirements.txt

from fastapi import FastAPI
from pydantic import BaseModel
from typing import Optional, List
import uuid
import httpx

from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_community.vectorstores import FAISS
from langchain_community.embeddings import HuggingFaceEmbeddings

# --- Local models (no API key needed) ---
# Uses HuggingFace sentence-transformers for embeddings (runs on CPU)
# Uses Ollama (llama3.2) for answer generation

print("Loading embedding model...")
embeddings = HuggingFaceEmbeddings(
    model_name="sentence-transformers/all-MiniLM-L6-v2",
    model_kwargs={"device": "cpu"},
    encode_kwargs={"normalize_embeddings": True},
)
print("Embedding model loaded.")

app = FastAPI(title="MedLens Q&A")

# In-memory store: document_id -> list of (chunk_text, metadata)
doc_store: dict[str, list[tuple[str, dict]]] = {}
memories = {}  # conversation_id -> chat history string

OLLAMA_URL = "http://localhost:11434"


def call_ollama(messages: list[dict], temperature: float = 0.2) -> str:
    """Call local Ollama llama3.2 for answer generation."""
    try:
        resp = httpx.post(
            f"{OLLAMA_URL}/api/chat",
            json={
                "model": "llama3.2",
                "messages": messages,
                "stream": False,
                "options": {"temperature": temperature, "num_predict": 512},
            },
            timeout=120.0,
        )
        resp.raise_for_status()
        return resp.json()["message"]["content"]
    except Exception as e:
        # Fallback if Ollama isn't running
        return f"[Error calling Ollama: {e}]"


def simple_search(question: str, document_id: str, k: int = 3) -> list[str]:
    """Simple keyword-based retrieval (works without vector DB issues)."""
    chunks = doc_store.get(document_id, [])
    if not chunks:
        return []

    keywords = set(question.lower().split())
    keywords = {w for w in keywords if len(w) > 2}

    scored = []
    for text, meta in chunks:
        lower = text.lower()
        score = sum(1 for kw in keywords if kw in lower)
        scored.append((score, text))

    scored.sort(key=lambda x: x[0], reverse=True)
    return [text for _, text in scored[:k]]


# ---- 1) n8n sends every uploaded document here ----
class Document(BaseModel):
    document_id: str
    patient_id: str
    text: str


@app.post("/documents")
def ingest(doc: Document):
    splitter = RecursiveCharacterTextSplitter(chunk_size=500, chunk_overlap=80)
    chunks = splitter.split_text(doc.text)
    meta = {"document_id": doc.document_id, "patient_id": doc.patient_id}
    doc_store[doc.document_id] = [(c, meta) for c in chunks]
    print(f"[ingest] document_id={doc.document_id} chunks={len(chunks)}")
    return {"ok": True, "chunks": len(chunks)}


# ---- 2) n8n forwards patient questions here ----
class Ask(BaseModel):
    question: str
    document_id: str
    patient_id: str
    conversation_id: Optional[str] = None


@app.post("/ask")
def ask(req: Ask):
    print(f"[ask] document_id={req.document_id} question={req.question[:60]}")

    # Retrieve relevant chunks
    hits = simple_search(req.question, req.document_id, k=3)
    context = "\n".join(hits) if hits else "(no relevant information found in document)"

    # Multi-turn memory
    conv_id = req.conversation_id or str(uuid.uuid4())
    history = memories.get(conv_id, "")

    # Build messages for LLM
    messages = [
        {
            "role": "system",
            "content": (
                "You are MedLens, a patient education assistant. Answer ONLY using the "
                "document context provided. Include specific values, numbers, and units "
                "exactly as written. If the answer is not in the context, say 'That information "
                "is not in your document.' Use simple everyday language. Never diagnose or give "
                "medical advice. Keep answers concise (2-5 sentences)."
            ),
        },
    ]

    if history:
        messages.append({"role": "user", "content": f"Earlier in this chat:\n{history}"})
        messages.append({"role": "assistant", "content": "I'll keep that in mind."})

    messages.append({
        "role": "user",
        "content": f"Document context:\n{context}\n\nQuestion: {req.question}",
    })

    answer = call_ollama(messages)

    # Save conversation history
    memories[conv_id] = history + f"\nQ: {req.question}\nA: {answer}"

    return {
        "answer": answer,
        "sources": [h[:150] for h in hits],
        "conversation_id": conv_id,
    }


@app.get("/health")
def health():
    return {"status": "ok", "service": "medlens-langchain", "documents": len(doc_store)}
