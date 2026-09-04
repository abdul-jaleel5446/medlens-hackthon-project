# MedLens — Complete Project Detail (both halves)

Hackathon project: MedLens turns medical documents (lab reports, prescriptions,
medical records) into plain-language explanations that normal patients can
actually understand — plus a chat feature where the patient can ask follow-up
questions about their own document.

---

## 1. The big picture (one paragraph)

A patient uploads a medical document (PDF or photo). MedLens reads it,
classifies what kind of document it is, and rewrites it in simple everyday
language. Before the patient sees anything, a **safety gate** checks for risky
content (dangerous dosages, alarming values) — risky documents get held for
clinician review instead of being shown. After the summary is delivered, the
patient can **chat with their document** ("What was my glucose level?") and get
grounded answers.

The system is split cleanly between two people, connected over plain HTTP:

```
PATIENT
   │  uploads PDF/photo
   ▼
┌──────────────────────────────────────────────┐
│  YOUR HALF — n8n pipeline (port 5678)        │
│  extract → classify → summarize → safety     │
└──────────────────┬───────────────────────────┘
                   │  HTTP POST (document text / questions)
                   ▼
┌──────────────────────────────────────────────┐
│  PARTNER'S HALF — LangChain Q&A (port 8000)  │
│  chunk → embed → vector store → RAG answers  │
└──────────────────────────────────────────────┘
```

---

## 2. YOUR part — the n8n pipeline (already done & tested)

### Flow 1: Document upload — `POST http://localhost:5678/webhook/medlens/upload`
Multipart form with two fields: `data` (the file) and `patientId`.

Step by step:
1. **Webhook Trigger** — receives the file + patientId
2. **Extract Metadata** — generates a unique documentId, detects PDF vs image
3. **File Type Check** — routes the file:
   - PDF → extract text directly
   - Image → OCR to read text from the photo
4. **Set Raw Text** — combines everything into one clean text block
5. **Register Document (LangChain)** — THIS IS THE HAND-OFF POINT: sends
   `{document_id, patient_id, text}` to the partner's service at
   `http://<his-ip>:8000/documents` so the patient can later ask questions
   about it
6. **Classification LLM** (local Ollama llama3.2) — decides the document type:
   prescription / lab_report / medical_record / other
7. **Switch Document Type** — picks the right explainer prompt per type
8. **Summarize** — the LLM rewrites the document in plain language
9. **Safety Check** — the LLM rates risk (low / medium / high) and lists
   red flags (e.g. dosage jumps, critical values, bleeding symptoms)
10. **Safety Gate**:
    - high risk → document is held, status `pending_review`, flagged for
      clinician review (never shown to the patient automatically)
    - low/medium risk → summary is delivered to the patient
11. **Format Final Response** — returns JSON:
    `{documentId, patientId, classification, riskLevel, status, summary, disclaimer}`

### Flow 2: Patient Q&A — `POST http://localhost:5678/webhook/medlens/ask`
JSON body: `{question, documentId, patientId, conversation_id?}`.
This flow forwards the question to the partner's service at
`http://<his-ip>:8000/ask` and passes the answer straight back to the patient.

### How to run my half
- n8n running on port 5678 (already set up)
- Test upload: `node scripts/medlens-upload.js samples/sample-lab-report.pdf P-1001`
  (pretty formatted output) or the raw curl equivalent
- Test Q&A: `curl.exe -X POST http://localhost:5678/webhook/medlens/ask ...`

---

## 3. PARTNER'S part — the LangChain Q&A service

### The job in plain language
Build a "smart librarian" for each patient's document:

1. **Receive the document.** My pipeline POSTs the full text to him on every
   upload. He chops it into small chunks ("index cards"), embeds each chunk
   (turns the meaning of the text into numbers), and stores them in a vector
   database tagged with that document's ID.
2. **Answer questions.** When a question arrives, he finds the 2–3 chunks most
   relevant to the question, hands them to an LLM with the instruction
   "answer using ONLY these chunks", and returns the answer + the chunks used.
3. **Remember the conversation.** Follow-ups like "and is that bad?" must
   know what was just asked. He keeps chat history keyed by a `conversation_id`
   that he creates and returns, and I send back on every follow-up.

### The exact contract — he must implement 2 endpoints on port 8000

**Endpoint 1: `POST /documents`** (my pipeline calls this automatically)
```json
request:  { "document_id": "uuid", "patient_id": "P-1001", "text": "full document text" }
response: any 2xx
```

**Endpoint 2: `POST /ask`** (my ask-webhook calls this)
```json
request:  {
  "question": "What was my fasting glucose result?",
  "document_id": "uuid",
  "patient_id": "P-1001",
  "conversation_id": "null on first message, his id afterwards"
}
response: {
  "answer": "plain-language answer grounded in the document",
  "sources": ["short quotes / chunk references"],
  "conversation_id": "his conversation id"
}
```

**Also useful:** a `GET /health` returning `{"status": "ok"}` so we can
check the connection in one second.

### Hard rules
1. **Port 8000** — my nodes point there
2. **Scope retrieval to document_id** — a patient must only ever see answers
   from their own document (privacy requirement)
3. **Grounded answers only** — if the answer isn't in the document, say so;
   medical context means zero hallucinations
4. **Multi-turn memory** keyed by conversation_id

### Skills he'll use
Python · FastAPI · LangChain (RAG chain + memory) · a vector store
(ChromaDB is easiest) · embeddings + an LLM (OpenAI gpt-4o-mini OR free local
Ollama models — llama3.2 for answers, nomic-embed-text for embeddings)

### His starter kit (already written, in the repo)
- `partner-langchain/app.py` — complete working service, both endpoints + memory,
  with OpenAI option AND free-Ollama option
- `partner-langchain/requirements.txt` — one `pip install -r` command
- `docs/HANDOFF_LANGCHAIN_PARTNER.md` — the handoff spec above in full

His entire to-do list:
1. `pip install -r requirements.txt`
2. Set his OpenAI key, OR uncomment the 3 Ollama lines in app.py (free)
3. `uvicorn app:app --host 0.0.0.0 --port 8000`
4. Done — his service now matches the contract exactly

---

## 4. How the two halves connect (different laptops, same WiFi)

**On his laptop:**
1. `uvicorn app:app --host 0.0.0.0 --port 8000` (`--host 0.0.0.0` lets my
   machine reach him, not just his own)
2. `ipconfig` → note the WiFi IPv4 address (like `192.168.x.x`)
3. If Windows Firewall asks about Python/uvicorn → Allow (Private networks)

**On my laptop:**
4. Verify reachability: `curl.exe http://HIS-IP:8000/health` → must return ok
5. Send me his IP → I update my two n8n nodes (Register Document + Call
   LangChain Q&A API) from `localhost:8000` to `http://HIS-IP:8000` (takes
   seconds via MCP)

### Integration test (demo day)
1. I upload a document:
   `node scripts/medlens-upload.js samples/sample-lab-report.pdf P-1001`
   → `POST /documents` should appear in HIS terminal (proof the link works)
2. I ask a question through my pipeline:
   `curl.exe -X POST http://localhost:5678/webhook/medlens/ask -H "Content-Type: application/json" -d "{\"question\":\"What was my fasting glucose?\",\"documentId\":\"<id from step 1>\",\"patientId\":\"P-1001\"}"`
   → his grounded answer comes back through my pipeline. Demo-ready.

⚠️ WiFi IPs can change between home and venue — if his IP changes, the two
node URLs get re-pointed in seconds.

---

## 5. Files in this repo

| File | What it is |
|---|---|
| `workflows/medlens-pipeline.n8n.json` | the n8n workflow definition |
| `scripts/medlens-upload.js` | friendly uploader with pretty output |
| `samples/sample-lab-report.pdf` | low-risk test document |
| `samples/sample-prescription-highrisk.pdf` | high-risk test document (trips safety gate) |
| `mock-langchain/server.js` | mock of his service (same contract) for testing without him |
| `partner-langchain/app.py` | his starter service |
| `partner-langchain/requirements.txt` | his Python dependencies |
| `docs/LANGCHAIN_API_CONTRACT.md` | the formal API contract |
| `docs/HANDOFF_LANGCHAIN_PARTNER.md` | handoff message for him |
