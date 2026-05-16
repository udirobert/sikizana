# Sikizana Project Roadmap 🚀

This roadmap outlines the journey from a hackathon prototype to a production-grade AI mediation agent for Kenyan chamas.

## 🏁 Phase 1: Hackathon Day (The Sprint)
*Focus: Meeting all mandatory GDG Nairobi Agentathon requirements.*

- [x] **Core Agent Infrastructure**: Python/FastAPI backend with Gemini 3.1 Pro.
- [x] **Multilingual Persona**: Sheng/Kiswahili grounding for authentic mediation.
- [x] **Tool Foundation**: Basic RAG (Bylaws) and Financial Analysis (M-Pesa).
- [ ] **Persistent Memory (Critical)**:
    - [ ] Integrate **Firestore** to store `thread_id` and conversation state.
    - [ ] Ensure the agent remembers previous disputes across sessions.
- [ ] **Full RAG Deployment**:
    - [ ] Move from mock RAG to **Vertex AI Agent Builder (Search)**.
    - [ ] Index a comprehensive set of sample chama bylaws.
- [ ] **Frontend Polish**:
    - [ ] Complete the Next.js UI with real-time API integration.
    - [ ] Add visual indicators for tool usage (e.g., "Sikizana is checking records...").
- [ ] **Deployment & Submission**:
    - [ ] Final push to **Google Cloud Run**.
    - [ ] Record a 2-minute demo video showing a Sheng-based mediation flow.

## 📈 Phase 2: Post-Hackathon (Refinement)
*Focus: Expanding usability and intelligence.*

- [ ] **Voice-First Mediation**: Integrate Google Speech-to-Text for voice-based disputes (Sheng/Kiswahili).
- [ ] **M-Pesa API Integration**: Move from manual PDF uploads to direct Daraja API transaction tracking.
- [ ] **WhatsApp Bot**: Deploy a Twilio/WhatsApp interface for low-bandwidth community access.
- [ ] **Document Ingestion**: Robust OCR for handwritten meeting notes and legacy ledgers.

## 🌍 Phase 3: Vision (Scale)
*Focus: Transforming the trust infrastructure of collective finance.*

- [ ] **SACCO & Microfinance Support**: Expand beyond chamas to formal cooperative societies.
- [ ] **Fraud & Anomaly Detection**: AI that alerts treasurers to suspicious transaction patterns.
- [ ] **Automated Legal Prep**: Generate mediation summaries ready for Small Claims Court if AI arbitration fails.
- [ ] **Multi-Agent Negotiation**: A specialized agent for each party (Member vs. Treasurer) to reach consensus autonomously.

---
*Built for the GDG Nairobi Agentathon — 16 May 2026*
