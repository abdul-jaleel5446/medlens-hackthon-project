/**
 * MedLens — mock LangChain Q&A service (stand-in for partner's API)
 * Implements docs/LANGCHAIN_API_CONTRACT.md — zero dependencies.
 *
 * Run:  node server.js          (port 8000, override with PORT env var)
 * Then: set LANGCHAIN_API_URL=http://localhost:8000 for n8n
 */
const http = require('http');

const PORT = process.env.PORT || 8000;
const documents = new Map();     // document_id -> { patientId, text, sentences, indexedAt }
const conversations = new Map(); // conversation_id -> [{ role, content }]

// ---------- helpers ----------
function sendJson(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => { data += chunk; if (data.length > 5e6) req.destroy(); });
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}); }
      catch { reject(new Error('invalid JSON body')); }
    });
    req.on('error', reject);
  });
}

function splitSentences(text) {
  return text
    .split(/(?<=[.!?\n])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** Tiny keyword-overlap "retrieval" — stands in for the vector store. */
function findSources(doc, question) {
  const keywords = question
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 3);

  return doc.sentences
    .map((s) => {
      const lower = s.toLowerCase();
      const score = keywords.reduce((n, k) => (lower.includes(k) ? n + 1 : n), 0);
      return { s, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((x) => x.s.slice(0, 500));
}

/** Call local Ollama (llama3.2) to generate a grounded answer. */
function callOllama(messages) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      model: 'llama3.2:latest',
      messages,
      stream: false,
      options: { temperature: 0.3, num_predict: 512 },
    });

    const req = http.request({
      hostname: 'localhost',
      port: 11434,
      path: '/api/chat',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
      timeout: 60000,
    }, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          const answer = parsed.message?.content?.trim();
          if (!answer) throw new Error('empty response from Ollama');
          resolve(answer);
        } catch (e) {
          reject(new Error('Ollama parse error: ' + e.message));
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Ollama timeout')); });
    req.write(payload);
    req.end();
  });
}

// ---------- endpoints ----------
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  // Health check
  if (req.method === 'GET' && url.pathname === '/health') {
    return sendJson(res, 200, { status: 'ok', documents: documents.size, service: 'medlens-mock-langchain' });
  }

  // POST /documents — n8n pushes extracted text here after upload
  if (req.method === 'POST' && url.pathname === '/documents') {
    let body;
    try { body = await readBody(req); }
    catch (e) { return sendJson(res, 400, { error: e.message }); }

    if (!body.document_id || !body.text) {
      return sendJson(res, 400, { error: 'document_id and text are required' });
    }

    documents.set(body.document_id, {
      patientId: body.patient_id ?? null,
      text: body.text,
      sentences: splitSentences(body.text),
      indexedAt: new Date().toISOString(),
    });

    console.log(`[index] ${body.document_id} (${body.text.length} chars)`);
    return sendJson(res, 200, {
      status: 'indexed',
      document_id: body.document_id,
      chunks: documents.get(body.document_id).sentences.length,
    });
  }

  // POST /ask — n8n forwards patient questions here
  if (req.method === 'POST' && url.pathname === '/ask') {
    let body;
    try { body = await readBody(req); }
    catch (e) { return sendJson(res, 400, { error: e.message }); }

    const { question, document_id } = body;
    if (!question || !document_id) {
      return sendJson(res, 400, { error: 'question and document_id are required' });
    }

    const doc = documents.get(document_id);
    if (!doc) {
      return sendJson(res, 404, { error: 'document not found' });
    }

    // Memory: resume or start a conversation
    const conversationId = body.conversation_id || `conv_${Date.now()}`;
    const history = conversations.get(conversationId) ?? [];

    // Use the full document text as context (already capped at 20K chars by the pipeline)
    // This gives the LLM everything it needs to answer specific questions
    const contextText = doc.text;
    const sources = findSources(doc, question);  // still used for "sources" in response

    // Build messages for the LLM
    const messages = [
      {
        role: 'system',
        content: `You are MedLens Q&A, a patient education assistant. Answer the patient's question using ONLY the information from their document below. Include specific values, names, numbers, and units exactly as written. If the answer is not in the document, say "That information is not mentioned in your document." Use simple everyday language. Never diagnose or give medical advice. Keep answers concise (2-5 sentences).`
      },
    ];

    // Add conversation history (last 4 turns for context)
    const recentHistory = history.slice(-4);
    for (const msg of recentHistory) {
      messages.push({ role: msg.role, content: msg.content });
    }

    messages.push({
      role: 'user',
      content: `Here is the patient's document:\n---\n${contextText}\n---\n\nQuestion: ${question}`
    });

    let answer;
    try {
      answer = await callOllama(messages);
    } catch (err) {
      console.error('[ollama] error:', err.message);
      // Fallback to keyword response if Ollama fails
      if (sources.length === 0) {
        answer = "I couldn't find that information in your uploaded document. Try asking about something mentioned in it.";
      } else {
        answer = `Based on your document: "${sources[0]}"`;
      }
    }

    history.push(
      { role: 'user', content: question },
      { role: 'assistant', content: answer },
    );
    conversations.set(conversationId, history);

    console.log(`[ask] ${document_id} | ${conversationId} | turns=${history.length / 2} | "${question.slice(0, 60)}"`);
    return sendJson(res, 200, { answer, sources, conversation_id: conversationId });
  }

  sendJson(res, 404, { error: `unknown route: ${req.method} ${url.pathname}` });
});

server.listen(PORT, () => {
  console.log(`MedLens mock LangChain API running on http://localhost:${PORT}`);
  console.log(`  POST /documents  — index a document`);
  console.log(`  POST /ask        — ask a question about a document`);
  console.log(`  GET  /health     — health check`);
});
