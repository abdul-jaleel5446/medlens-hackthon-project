# LangChain Q&A API Contract (Partner's Part)

This is the exact HTTP interface the n8n workflow calls. Build your LangChain service to match this and the two halves plug together with zero changes.

## Endpoint

```
POST {LANGCHAIN_API_URL}/ask
Content-Type: application/json
```

## Request Body

| Field             | Type   | Required | Description                                          |
|-------------------|--------|----------|------------------------------------------------------|
| `question`        | string | yes      | The patient's follow-up question                     |
| `document_id`     | string | yes      | Which uploaded document the question is about        |
| `patient_id`      | string | no       | Patient identifier (for per-patient memory scoping)  |
| `conversation_id` | string | no       | Pass back the value you returned earlier to continue a multi-turn conversation; `null`/absent = new conversation |

### Example request

```json
{
  "question": "What does my glucose level mean?",
  "document_id": "doc_1723456789",
  "patient_id": "P-1001",
  "conversation_id": null
}
```

## Response Body

| Field             | Type   | Required | Description                                    |
|-------------------|--------|----------|------------------------------------------------|
| `answer`          | string | yes      | Plain-language answer grounded in the document |
| `sources`         | array  | yes      | Snippets/quotes from the document backing the answer (may be empty) |
| `conversation_id` | string | yes      | ID to pass back on the next turn for memory    |

### Example response

```json
{
  "answer": "Your fasting glucose is 105 mg/dL, which is slightly above the normal range...",
  "sources": ["Fasting glucose: 105 mg/dL (ref: 70-99)"],
  "conversation_id": "conv_abc123"
}
```

## Behavior expectations

1. **Retrieval-grounded** — answers must cite the uploaded document; if the answer isn't in the document, say so instead of guessing.
2. **Memory** — same `conversation_id` = the model remembers prior turns about that document.
3. **Errors** — return HTTP `404` with `{"error": "document not found"}` if the `document_id` is unknown; the n8n side surfaces the error to the user.

## How the n8n side consumes it

`Ask Question` webhook → `Call LangChain Q&A API` node POSTs to `{LANGCHAIN_API_URL}/ask` → `Respond Answer` returns `{ answer, sources, conversationId }` to the patient UI.

## Document hand-off (decided: Option A)

The n8n pipeline POSTs the extracted document text to your service right after upload:

```
POST {LANGCHAIN_API_URL}/documents
Content-Type: application/json
```

```json
{
  "document_id": "doc_1723456789",
  "patient_id": "P-1001",
  "text": "full extracted text of the document..."
}
```

Your service should index the text for retrieval so `/ask` can answer questions about that `document_id`. The n8n node is error-tolerant: if your service is down, the summarization pipeline still completes, so return any sensible ack (e.g. `{"status": "indexed"}`).
