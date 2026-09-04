/**
 * MedLens — clinician review queue (demo receiver)
 * Receives high-risk summaries that the n8n safety gate blocks from patients.
 * Zero dependencies. Run:  node review-receiver.js   (port 9000)
 */
const http = require('http');

const PORT = process.env.PORT || 9000;

const server = http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/review') {
    let data = '';
    req.on('data', (c) => (data += c));
    req.on('end', () => {
      let payload;
      try { payload = JSON.parse(data); } catch { payload = { raw: data }; }

      console.log('\n========== HIGH-RISK SUMMARY — AWAITING CLINICIAN REVIEW ==========');
      console.log(`Document : ${payload.documentId}`);
      console.log(`Patient  : ${payload.patientId}`);
      console.log(`Type     : ${payload.docType}`);
      console.log(`Red flags: ${JSON.stringify(payload.redFlags)}`);
      console.log(`Summary  : ${payload.summary}`);
      console.log('====================================================================\n');

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'queued_for_review' }));
    });
    return;
  }
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'not found' }));
});

server.listen(PORT, () => {
  console.log(`MedLens review queue listening on http://localhost:${PORT}/review`);
});
