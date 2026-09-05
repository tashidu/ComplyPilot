# Alibaba Cloud AI Buildathon - Final Submission

**Team Verified:** Team Odin  
**Participant:** M.G.Tashidu Vinuka  
**Email:** vinukatashidu@gmail.com  
**Status:** Implementation complete. Demo video, hosted URL and repository visibility outstanding.  

---
# Alibaba Cloud AI Buildathon - Final Submission

**Team Verified:** Team Odin  
**Participant:** M.G.Tashidu Vinuka  
**Email:** vinukatashidu@gmail.com  
**Status:** Implementation complete. Demo video, hosted URL and repository visibility outstanding.  

---

## 1. Project Brief

### Problem
In Sri Lanka, the Simplified VAT (SVAT) scheme is being abolished effective 1 October 2025. This shifts exporters from a voucher-based system to a cash-intensive, standard 45-day VAT refund framework. Delayed refunds—often caused by simple documentary errors, misaligned data between customs and schedules, or non-compliant supplier invoices—can severely cripple an exporter's cash flow. Compliance now directly controls cash flow, and traditional manual reconciliation is too slow and error-prone to protect the 45-day refund clock.

### Solution
**ComplyPilot RefundShield** is a VAT Refund Readiness & Compliance Autopilot designed specifically for Sri Lankan exporters. It automatically processes VAT-related documents without errors, features an interactive AI chatbox for instant data queries, and plans to integrate seamlessly with the IRD's RAMIS portal using an automated GUI filing agent. It acts as a pre-flight check before official submission. ComplyPilot continuously analyzes invoices, supplier data, VAT schedules, and customs records. It explains every compliance blocker, estimates the earliest eligible refund timeline, runs deterministic checks based on Gazetted rules (e.g., October 2026 invoice formats), and prepares a traceable, human-approved evidence trail to ensure the 45-day refund clock isn't derailed by basic errors.

### AI Features in Your Product
- **Multimodal Document Extraction:** Alibaba Cloud **Qwen-VL** via Model Studio extracts structured invoice fields from photographed invoices, with per-field confidence and source text. Every model response is schema-validated with Zod before it is used.
- **GUI Filing Agent:** After human approval, an agent completes the filing by *operating a portal on screen* rather than calling an API. It takes a screenshot, reads the page's interactive controls, asks Qwen for the single next action, performs it, and looks again. It stops at identity verification: an action targeting an OTP or CAPTCHA field is rewritten to a human hand-off even if the model requests it.
- **Multi-Agent Pre-flight Workflow:** Document Compliance, Supplier Reconciliation and Refund Readiness agents run behind a local orchestrator, with a MuleRun-ready adapter and an explicit human approval gate.
- **Regulatory Watch Agent:** A scheduled check surfaces changes to published IRD sources and summarises the impact. Detection is simulated in this MVP; the approval gate is real, and no rule pack activates without a named human tax reviewer.
- **Deterministic scoring, not model-generated:** An LLM never produces the readiness score. It is plain TypeScript, so every point is reproducible by hand.
- **Live VAT Schedule Reconciliation:** A user-uploaded CSV is parsed deterministically and matched to the extracted invoice by invoice number, supplier TIN, net value, VAT and gross value. Every variance is visible and routed to the human gate.
- **Refund Evidence Passport:** The prototype exports a source-dated JSON evidence manifest containing findings, rule sources, workflow trace and audit history, plus a SHA-256 content digest.
- **Grounded Data Copilot:** A run-aware chatbox answers from the current score, findings, invoice extraction, schedule reconciliation and allow-listed official-source metadata, with clear live-Qwen/fallback disclosure.

### Technical Brief
- **Application:** Next.js 15 (App Router), React 19, TypeScript. API routes serve as the backend; there is no separate service.
- **Styling:** Hand-written CSS design system, responsive, no UI framework.
- **AI Integration:** Alibaba Cloud Model Studio (`qwen-vl-plus`) through the OpenAI-compatible endpoint, called only from server-side code.
- **Browser automation:** Playwright drives a mock tax portal bundled with the app at `/mock-portal`. It never contacts the Inland Revenue Department.
- **Workflow:** A local multi-agent orchestrator with a **MuleRun-ready adapter**. The adapter is implemented and verified end to end against a stub webhook, including the failure path; publishing the production MuleRun workflow is the next roadmap stage. MuleRun findings are advisory only and can never move the score.
- **Evidence ingestion:** Invoice images (up to 10 MB) and VAT Schedule CSV files (up to 2 MB / 2,000 rows) are accepted. Schedule values are parsed without an LLM and held only in the in-memory demo run store.
- **Live vs fallback:** The header shows `AI: LIVE QWEN` or `DEMO FALLBACK`, and `Workflow: LIVE MULERUN` or `LOCAL ORCHESTRATOR`. Fixture data is never presented as a live model response.

### Impact
ComplyPilot transforms a historically reactive, penalty-driven process into a proactive, cash-flow-protecting strategy. By automatically catching compliance blockers *before* filing, it ensures that Sri Lankan exporters can confidently rely on the 45-day refund framework. This safeguards millions of rupees in working capital, reduces friction with the Inland Revenue Department (IRD), and significantly lowers administrative overhead.

### Roadmap
- **Publish the MuleRun production workflow:** the adapter and fallback are already in place; only the hosted workflow is outstanding.
- **Live Regulatory Watch:** replace simulated detection with real scheduled source monitoring, keeping the human approval gate.
- **Expanded evidence ingestion:** Extend the working VAT Schedule CSV flow to official workbook variants, ledgers and authorised Customs evidence before considering any live government integration.
- **Supplier Notification Engine:** Automated outreach to suppliers to correct non-compliant invoices before the filing deadline.
- **Expanded Rule Packs:** Supporting additional export verticals (e.g., apparel, tea) and local tax permutations.
- **Enterprise Dashboard:** Multi-tenant support for tax agents managing hundreds of exporter clients simultaneously.

### Scope and boundaries

This is a hackathon prototype and decision-support concept, not tax, accounting or legal advice.

- Synthetic supplier and Customs data only; optional user-uploaded invoice and schedule evidence is ephemeral and never committed to the repository.
- No live IRD filing. The GUI agent operates a mock portal bundled with the app.
- The readiness score is an internal, published proxy. It does not reproduce the IRD's official Low/Medium/High risk model and does not guarantee a refund or payment date.
- No unattended filing: a human approves before submission, and one-time passwords are always entered by a person.

---

## 2. Links & Statement

### Demo Video
**TODO — not yet recorded.** Record against the hosted URL, not localhost.

### Source Repository
https://github.com/tashidu/ComplyPilot
**TODO — the repository is currently private and must be made public before submission.**

### Hosted Prototype
**TODO — not yet deployed.** Target: Alibaba Cloud ECS, Singapore region (see README for the deployment runbook).

### WhatsApp Number
**TODO — add your contact number.**

### Qoder Usage Statement
I used Qoder as my primary pair-programming agent throughout the entire Buildathon. Qoder was instrumental in scaffolding the Next.js App Router architecture, structuring the multi-agent backend, and rapidly developing the frontend UI components. It successfully integrated the Alibaba Cloud Qwen-VL-Plus model via the Model Studio API and handled complex state migrations (moving from static UI mocks to dynamic, API-driven React state). The experience was highly efficient—it accelerated boilerplate generation and component styling tremendously, allowing me to focus on the core business logic and multi-agent orchestration for the VAT compliance workflow.
