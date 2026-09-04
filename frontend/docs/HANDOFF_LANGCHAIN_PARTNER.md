# MedLens — LangChain Q&A Handoff (for the LangChain partner)

Hey! My n8n pipeline side is done and tested end-to-end. Here's everything you need
to build your half — the conversational Q&A service over uploaded documents.

## The deal
- **My side (n8n):** patient uploads PDF/image → extract → classify → plain-language
  summary → safety gate → delivered or held for review. On every upload, my pipeline
  also POSTs the full document text to YOUR service so patients can chat with it.
- **Your side (LangChain):** RAG Q&A over those documents with multi-turn memory,
  exposed as a simple HTTP API.

## You must implement 2 endpoints

### 1) POST /documents — receive & index a document
My pipeline calls this automatically on every successful upload.

Request:
```json
{
  "document_id": "uuid-string",
  "patient_id": "P-1001",
  "text": "full extracted document text (up to ~20k chars)"
}
```
Your job: chunk the text, embed, store in a vector store keyed by `document_id`.
Any 2xx response works.

### 2) POST /ask — answer a patient's question
My `/webhook/medlens/ask` forwards the patient's question here.

Request:
```json
{
  "question": "What was my fasting glucose result?",
  "document_id": "uuid-string",
  "patient_id": "P-1001",
  "conversation_id": "optional, null on first message"
}
```
Response:
```json
{
  "answer": "plain-language answer grounded in the document",
  "sources": ["short quotes or chunk refs"],
  "conversation_id": "same or new id — return it so follow-ups keep memory"
}
```

## Important constraints
1. **Run on port 8000** (`http://localhost:8000`). My n8n nodes point there.
   If you need a different port, tell me and I'll update two nodes.
2. **Scope retrieval to `document_id`** — a patient must only ever retrieve
   chunks from their own document (privacy requirement).
3. **Keep answers grounded** — instruct your chain to refuse when the answer
   isn't in the document. Medical context: no hallucinations allowed.
4. **Multi-turn memory** keyed by `conversation_id` (follow-up questions like
   "and the second test?" must work).

## Test without me
A working mock of my expectations lives in `mock-langchain/server.js`:
```
node mock-langchain/server.js
```
Then:
```
curl -X POST http://localhost:8000/documents -H "Content-Type: application/json" -d "{\"document_id\":\"d1\",\"patient_id\":\"P-1001\",\"text\":\"Fasting Glucose: 105 mg/dL. A1c: 5.9%.\"}"

curl -X POST http://localhost:8000/ask -H "Content-Type: application/json" -d "{\"question\":\"What was my fasting glucose?\",\"document_id\":\"d1\",\"patient_id\":\"P-1001\"}"
```
Match that contract and our halves snap together with zero changes.

## Demo day integration test
1. You start your service (port 8000), I start n8n.
2. Upload a doc through my pipeline:
   `curl -X POST http://localhost:5678/webhook/medlens/upload -F "data=@sample.pdf" -F "patientId=P-1001"`
3. Ask a question through my pipeline:
   `curl -X POST http://localhost:5678/webhook/medlens/ask -H "Content-Type: application/json" -d "{\"question\":\"...\",\"documentId\":\"<id from step 2>\",\"patientId\":\"P-1001\"}"`

Questions? Ping me. Full contract also in `docs/LANGCHAIN_API_CONTRACT.md`.
