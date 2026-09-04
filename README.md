# MedLens — plain-language explanations for medical documents

Hackathon project, 2-person split:

| Part | Owner | Stack | Responsibility |
|------|-------|-------|----------------|
| Pipeline | **You** | n8n | Upload/ingestion → classification → LLM summarization → human-in-the-loop safety gate → delivery |
| Conversation | Partner | LangChain | Q&A over the document, retrieval, multi-turn memory, exposed as HTTP API |

**Connection point:** n8n calls the LangChain API via a simple HTTP request (`question` + `document_id` → `answer` + `sources`).

```
Patient ──upload──▶ [n8n: extract → classify → summarize → safety gate] ──summary──▶ Patient
Patient ──question─▶ [n8n /medlens/ask] ──HTTP──▶ [LangChain Q&A API] ──answer──▶ Patient
                                           high-risk summary ──▶ Clinician review queue
```

## Repo layout

```
workflows/medlens-pipeline.n8n.json   ← import this into n8n (your whole part)
docs/LANGCHAIN_API_CONTRACT.md        ← hand this to your partner
mock-langchain/                       ← stand-in for partner's API (zero deps, for dev/demo)
.env.example                          ← required environment variables
```

## Mock LangChain server (test without your partner)

Implements the full contract — `POST /documents`, `POST /ask` (with retrieval + conversation memory), `GET /health`:

```powershell
node mock-langchain/server.js   # runs on http://localhost:8000
```

Test payloads included: `mock-langchain/test-doc.json` and `mock-langchain/test-ask.json`. When your partner's real service is up, just point `LANGCHAIN_API_URL` at it — zero workflow changes.

## Setup (n8n)

1. Run n8n locally: `npx n8n` (or use n8n cloud) with the env vars from `.env.example` set.
2. Open n8n → **Workflows → Import from File** → select `workflows/medlens-pipeline.n8n.json`.
3. **Activate** the workflow so the webhooks go live.
4. Point `REVIEW_WEBHOOK_URL` at anything that receives JSON for the demo (a Slack incoming webhook, a second n8n webhook, or https://webhook.site).

### Environment variables

| Variable             | Purpose                                        |
|----------------------|------------------------------------------------|
| `OPENAI_API_KEY`     | Powers classification + summarization (gpt-4o-mini) |
| `LANGCHAIN_API_URL`  | Base URL of your partner's LangChain service   |
| `REVIEW_WEBHOOK_URL` | Where high-risk summaries are sent for human review |

## API (what your demo/frontend calls)

### 1. Upload a document

```bash
curl -X POST http://localhost:5678/webhook/medlens/upload \
  -F "data=@lab_report.pdf" \
  -F "patientId=P-1001"
```

Responses:

- **200 `{"status":"ready", ...}`** — safe summary, ready to show the patient. Includes `summary`, `keyFindings`, `docType`, `disclaimer`.
- **202 `{"status":"pending_review", ...}`** — high-risk content detected; held for clinician review (the human-in-the-loop checkpoint).

### 2. Ask a question about a document

```bash
curl -X POST http://localhost:5678/webhook/medlens/ask \
  -H "Content-Type: application/json" \
  -d '{"question":"What does my glucose level mean?","documentId":"doc_1723456789","patientId":"P-1001"}'
```

Returns `{"answer", "sources", "conversationId"}` from the LangChain service.

## Safety design (judges will ask)

- LLM is prompted to **never invent** facts not in the document.
- Every summary includes a `red_flags` list and a `risk_level` (`low`/`medium`/`high`).
- **Fail-safe:** if the summary output can't be parsed, it's treated as high-risk and routed to human review — never shown raw.
- High-risk summaries are **blocked from the patient** and pushed to `REVIEW_WEBHOOK_URL` instead; patient gets `202 pending_review`.
- Every delivered summary carries a medical disclaimer.

## Current limitations / next steps

- PDF-only extraction (swap/add `Extract from File` operations for images/DOCX if needed).
- Document hand-off to LangChain is done via `{LANGCHAIN_API_URL}/documents` (error-tolerant) — see `docs/LANGCHAIN_API_CONTRACT.md`.
- Review queue is webhook-based; for the demo, approve/reject manually.
