# MedLens — Hackathon Presentation

---

## Slide 1: Title Slide

**MedLens**
*Making Medical Documents Understandable for Everyone*

[Your Name] & [Partner's Name]

---

## Slide 2: The Problem

### Medical documents are written for doctors, not patients.

- **50%** of adults struggle to understand their medical prescriptions and lab reports
- **Medication errors** cause over **100,000 deaths** annually worldwide — many from patients misreading doses or instructions
- Patients leave the clinic confused, Google symptoms, and make dangerous decisions
- Lab reports are full of jargon: "Hemoglobin A1c: 6.2%" — what does that actually mean to someone without medical training?
- **Who it affects:** Everyone — elderly patients, parents reading their child's prescriptions, people in rural areas without easy access to doctors

> *"I got my lab report but I have no idea if my results are good or bad."*
> — Every patient, everywhere

---

## Slide 3: Our Solution

### MedLens: Upload your medical document → Get a plain-language explanation instantly.

**What it does:**
1. **Upload** a photo or PDF of any medical document — prescription, lab report, or medical record
2. **MedLens reads it** — extracts text (even from photos), classifies the document type, and generates a patient-friendly summary
3. **Safety gate** — high-risk documents (pediatric doses, pregnancy, blood thinners) are automatically flagged for human review before the patient sees them
4. **Ask questions** — patients can ask follow-up questions in plain English and get AI-powered answers grounded in THEIR document

**Who it serves:**
- Patients who want to understand their own health documents
- Elderly patients who find medical jargon confusing
- Parents managing prescriptions for children or elderly family members
- Anyone in areas where a doctor's visit just to "explain this" is hours away

---

## Slide 4: The Need & The Impact

### Why this matters NOW

- **Health literacy** is one of the biggest unsolved problems in healthcare
- The global digital health market is projected to reach **$660 billion by 2027**
- Post-pandemic, patients are handling MORE medical documents than ever (telemedicine, digital lab portals, e-prescriptions)

### The impact MedLens makes:

| Before MedLens | With MedLens |
|---|---|
| "My glucose is 112 mg/dL... is that bad?" | "Your fasting glucose is 112 mg/dL, which is slightly above the normal range of 70-99. This may indicate pre-diabetes — discuss with your doctor." |
| Patient Googles symptoms, panics | Patient gets calm, document-grounded explanations |
| Dangerous self-medication decisions | Safety gate catches high-risk documents before delivery |
| No follow-up without another doctor visit | Conversational Q&A on the same document, anytime |

---

## Slide 5: Innovation & Technology

### Architecture — One intelligent pipeline

```
Patient uploads document (PDF or photo)
        │
        ▼
┌──────────────────────────────────────────────────────┐
│  n8n Pipeline (Full AI Orchestration)                │
│                                                      │
│  Upload → OCR/Text Extract → Classify → Summarize   │
│  → Safety Check → Store → Conversational Q&A        │
│                                                      │
│  Tech: n8n, Ollama (Llama 3.2), Gemini OCR,        │
│        n8n Data Tables, Node.js frontend             │
└──────────────────────────────────────────────────────┘
```

### What makes it innovative:

1. **Multi-modal input** — handles both text PDFs and photos/scanned documents (Gemini OCR)
2. **Smart classification** — automatically detects prescription vs. lab report vs. medical record and uses tailored summarization prompts
3. **Safety-first design** — AI-powered risk detection flags dangerous documents for human review
4. **Document-grounded Q&A** — answers are grounded in the patient's ACTUAL document, not hallucinated from general knowledge
5. **Fully local AI** — runs entirely on local LLMs (Llama 3.2), no patient data ever leaves the system
6. **Zero external API dependencies** — no OpenAI, no cloud AI services, complete data privacy

---

## Slide 6: What We Built (Feasibility)

### This is not a concept — it's a working product.

**What's live right now:**
- ✅ Full document upload pipeline (PDF + image support)
- ✅ AI-powered document classification (prescription / lab report / medical record)
- ✅ Patient-friendly summarization using Llama 3.2
- ✅ Safety gate with automatic human-review flagging
- ✅ Conversational Q&A — ask questions about YOUR document, get specific answers
- ✅ Web frontend — drag-and-drop upload, real-time summary, chat interface
- ✅ Local document storage with n8n Data Tables
- ✅ 100% local AI — zero external API calls, complete data privacy

**Tech stack:**
- n8n (workflow orchestration + data storage)
- Ollama + Llama 3.2 (local LLM for classification, summarization, safety, Q&A)
- Google Gemini (OCR for scanned documents)
- Node.js (frontend proxy server)

**Demo-ready:** Upload a real prescription → get a plain-language summary in ~3 minutes → ask follow-up questions → get specific, document-grounded answers.

---

## Slide 7: What's Next

- **Mobile app** — snap a photo of your prescription at the pharmacy
- **Multi-language support** — serve non-English speaking patients
- **Pharmacist integration** — connect to pharmacy systems for medication verification
- **Hospital deployment** — integrate with EHR systems for discharge summaries
- **Regulatory compliance** — HIPAA/GDPR certification for clinical use

---

## Slide 8: Thank You

**MedLens** — *Because every patient deserves to understand their own health.*

Questions?
