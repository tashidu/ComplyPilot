# Alibaba Cloud AI Buildathon - Final Submission

**Team Verified:** Team Odin  
**Participant:** M.G.Tashidu Vinuka  
**Email:** vinukatashidu@gmail.com  
**Status:** Ready to Submit  

---

## 1. Project Brief

### Problem
In Sri Lanka, the Simplified VAT (SVAT) scheme is being abolished effective 1 October 2025. This shifts exporters from a voucher-based system to a cash-intensive, standard 45-day VAT refund framework. Delayed refunds—often caused by simple documentary errors, misaligned data between customs and schedules, or non-compliant supplier invoices—can severely cripple an exporter's cash flow. Compliance now directly controls cash flow, and traditional manual reconciliation is too slow and error-prone to protect the 45-day refund clock.

### Solution
**ComplyPilot RefundShield** is a VAT Refund Readiness & Compliance Autopilot designed specifically for Sri Lankan exporters. It acts as a pre-flight check before official submission. ComplyPilot continuously analyzes invoices, supplier data, VAT schedules, and customs records. It explains every compliance blocker, estimates the earliest eligible refund timeline, runs deterministic checks based on Gazetted rules (e.g., October 2026 invoice formats), and prepares a traceable, human-approved evidence trail to ensure the 45-day refund clock isn't derailed by basic errors.

### AI Features in Your Product
- **Multi-Agent Orchestration (MuleRun):** A coordinated fleet of specialist agents (Document Compliance, Supplier Reconciliation, and Refund Readiness) work together to process evidence bundles.
- **Multimodal Document Extraction:** Uses **Alibaba Cloud's Qwen-VL-Plus** (via Model Studio) to accurately extract over 90 fields from complex, unstructured invoice images, assessing confidence levels for each field.
- **Dynamic "What-If" Analysis:** The system simulates regulatory changes (like the Gazetted invoice format updates) and dynamically recalculates readiness scores and blockers using a deterministic AI rule engine.

### Technical Brief
- **Frontend & Backend:** Next.js 15 (App Router), React, and TypeScript.
- **Styling:** Vanilla CSS with modern, responsive grid layouts and fluid UI feedback.
- **AI Integration:** Alibaba Cloud Model Studio API (`qwen-vl-plus`), integrated using the OpenAI compatible SDK for Node.js.
- **Architecture:** 
  - **Agents Directory:** Modular logic for document compliance, reconciliation, and readiness scoring.
  - **Orchestrator:** A centralized workflow engine that merges AI inferences with deterministic business rules.
  - **State Management:** Fully dynamic UI driven by API route computations and local React state.

### Impact
ComplyPilot transforms a historically reactive, penalty-driven process into a proactive, cash-flow-protecting strategy. By automatically catching compliance blockers *before* filing, it ensures that Sri Lankan exporters can confidently rely on the 45-day refund framework. This safeguards millions of rupees in working capital, reduces friction with the Inland Revenue Department (IRD), and significantly lowers administrative overhead.

### Roadmap
- **Live IRD & Customs Integration:** Moving from synthetic data to direct API connections with ASYCUDA (Customs) and the RAMIS (IRD) portals.
- **Supplier Notification Engine:** Automated outreach to suppliers to correct non-compliant invoices before the filing deadline.
- **Expanded Rule Packs:** Supporting additional export verticals (e.g., apparel, tea) and local tax permutations.
- **Enterprise Dashboard:** Multi-tenant support for tax agents managing hundreds of exporter clients simultaneously.

---

## 2. Links & Statement

### Demo Video
*Placeholder: [https://youtube.com/watch?v=...]*

### Source Repository
*Placeholder: [https://github.com/your-team/complypilot-refundshield]*

### Hosted Prototype
*Placeholder: [https://your-project.vercel.app]*

### WhatsApp Number
*Placeholder: [+94 71 234 5678]*

### Qoder Usage Statement
I used Qoder as my primary pair-programming agent throughout the entire Buildathon. Qoder was instrumental in scaffolding the Next.js App Router architecture, structuring the multi-agent backend, and rapidly developing the frontend UI components. It successfully integrated the Alibaba Cloud Qwen-VL-Plus model via the Model Studio API and handled complex state migrations (moving from static UI mocks to dynamic, API-driven React state). The experience was highly efficient—it accelerated boilerplate generation and component styling tremendously, allowing me to focus on the core business logic and multi-agent orchestration for the VAT compliance workflow.
