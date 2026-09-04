// MedLens friendly uploader — uploads a document and prints the plain-language
// summary in a readable format instead of raw JSON.
//
// Usage:
//   node scripts/medlens-upload.js <path-to-file> [patientId]
// Example:
//   node scripts/medlens-upload.js samples/sample-lab-report.pdf P-1001

const fs = require('fs');
const path = require('path');

const MEDLENS_URL = process.env.MEDLENS_URL || 'http://localhost:5678';

const file = process.argv[2];
const patientId = process.argv[3] || 'anonymous';

if (!file) {
  console.log('Usage: node scripts/medlens-upload.js <path-to-file> [patientId]');
  console.log('Example: node scripts/medlens-upload.js samples/sample-lab-report.pdf P-1001');
  process.exit(1);
}

const filePath = path.resolve(file);
if (!fs.existsSync(filePath)) {
  console.log(`File not found: ${filePath}`);
  process.exit(1);
}

(async () => {
  const buffer = fs.readFileSync(filePath);
  const form = new FormData();
  form.append('data', new Blob([buffer]), path.basename(filePath));
  form.append('patientId', patientId);

  console.log(`\n📤 Uploading ${path.basename(filePath)} for patient ${patientId}...`);
  console.log('⏳ This takes 1-4 minutes (local LLM: classify → summarize → safety check)\n');

  const started = Date.now();
  const res = await fetch(`${MEDLENS_URL}/webhook/medlens/upload`, { method: 'POST', body: form });
  const secs = ((Date.now() - started) / 1000).toFixed(1);

  if (!res.ok) {
    console.log(`❌ MedLens returned HTTP ${res.status}`);
    console.log(await res.text());
    process.exit(1);
  }

  const r = await res.json();
  const line = '─'.repeat(60);

  console.log(line);
  console.log(r.ok === false ? '❌ MedLens could not process this document' : '✅ MedLens finished (' + secs + 's)');
  console.log(line);
  console.log(`Document ID : ${r.documentId}`);
  console.log(`Patient     : ${r.patientId}`);
  console.log(`Type        : ${r.classification}`);
  console.log(`Risk level  : ${r.riskLevel}`);
  if (r.status === 'pending_review') {
    console.log(`Status      : 🔴 HELD FOR CLINICIAN REVIEW before the patient sees it`);
  } else {
    console.log(`Status      : 🟢 Delivered to patient`);
  }
  console.log(line);
  console.log('\n📄 PLAIN-LANGUAGE SUMMARY\n');
  console.log(r.summary || '(no summary returned)');
  console.log(`\n${line}`);
  console.log(`⚠️  ${r.disclaimer || 'This is an AI-generated explanation, not medical advice.'}`);
  console.log(line + '\n');
})().catch((err) => {
  console.log('❌ Failed to reach MedLens at ' + MEDLENS_URL);
  console.log('   Is n8n running? Error: ' + err.message);
  process.exit(1);
});
