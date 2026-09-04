/**
 * Generates sample medical PDFs for testing the MedLens n8n pipeline.
 * Zero dependencies. Run: node make-sample-pdfs.js
 */
const fs = require('fs');

function makePdf(lines) {
  const esc = (s) => s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  const content =
    'BT\n/F1 11 Tf\n14 TL\n50 760 Td\n' +
    lines.map((l) => `(${esc(l)}) Tj T*`).join('\n') +
    '\nET';

  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];

  let pdf = '%PDF-1.4\n';
  const offsets = [];
  objects.forEach((obj, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const xrefPos = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.forEach((o) => { pdf += `${String(o).padStart(10, '0')} 00000 n \n`; });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF\n`;
  return pdf;
}

// 1) Routine-ish lab report -> should summarize with low/medium risk
fs.writeFileSync('sample-lab-report.pdf', makePdf([
  'CITY HOSPITAL - LABORATORY REPORT',
  'Patient: John Doe   DOB: 03/14/1985   MRN: 482913',
  'Collected: 08/20/2026   Reported: 08/21/2026',
  '',
  'Fasting Glucose: 105 mg/dL      (Reference: 70-99)',
  'Hemoglobin A1c: 5.9 %           (Reference: below 5.7)',
  'Blood Pressure: 130/85 mmHg',
  'Total Cholesterol: 195 mg/dL    (Reference: below 200)',
  'HDL: 42 mg/dL                   (Reference: above 40)',
  'Creatinine: 0.9 mg/dL           (Reference: 0.7-1.3)',
  '',
  'Interpretation: Mildly elevated fasting glucose and A1c',
  'consistent with pre-diabetes range.',
  'Recommendation: Follow up with physician for lifestyle',
  'modifications and repeat testing in 3 months.',
]));

// 2) High-risk prescription -> should trip the safety gate
fs.writeFileSync('sample-prescription-highrisk.pdf', makePdf([
  'PRESCRIPTION - Mercy Clinic',
  'Patient: Jane Smith   DOB: 11/02/1961',
  'Date: 08/25/2026   Dr: A. Rivera, MD',
  '',
  'Warfarin 5 mg tablet - take 3 tablets daily (15 mg total).',
  'Note: Previous dose was 5 mg daily. DOSE TRIPLED.',
  'Patient also reports unexplained bruising and blood in stool.',
  'INR not checked in 6 months. History of GI bleeding 2024.',
  '',
  'Refills: 2',
]));

console.log('Created sample-lab-report.pdf and sample-prescription-highrisk.pdf');
