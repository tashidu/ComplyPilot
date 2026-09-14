# ComplyPilot RefundShield — First-Place Product and Implementation Plan

**Team:** Team Odin

**Event:** AI Buildathon 2026, powered by Alibaba Cloud

**Finals:** 16 September 2026

**Plan snapshot:** 14 September 2026

**Audience:** Human developers and AI coding agents working in this repository

## 1. Product decision

Do not build ComplyPilot as a generic VAT calculator, invoice generator, tax chatbot, or portal-clicking bot.

Build one coherent product:

> **ComplyPilot RefundShield is the AI evidence and VAT-recovery layer between messy business records and Sri Lanka's digital tax infrastructure. It finds which input VAT is at risk, explains why, simulates the fastest recovery path, and creates a human-approved, audit-ready evidence package.**

The final concept combines two strong ideas without becoming a collection of unrelated demos:

- **AI Invoice Guardian is the entry point:** photo/PDF/CSV ingestion, Qwen extraction, date-aware invoice validation, and assisted correction.
- **Reconciliation and Refund Intelligence are the core business value:** match invoice evidence to schedules and other evidence, quantify LKR at risk, and prioritise corrective actions.
- **Refund Rescue Simulator is the signature wow feature:** show the actual state and a separate what-if state, so judges can see how specific actions change readiness and protect recoverable VAT.
- **Evidence Passport is the trust layer:** provenance, rule versions, approvals, audit history, and a tamper-evident digest.
- **RAMIS is an integration endpoint, not the product:** produce verified schedule data and a clearly labelled mock adapter. Never imply that the prototype is connected to live IRD infrastructure.

### Product tagline

> **From a paper invoice to recoverable, audit-ready VAT evidence — with every rupee, rule, and decision traceable.**

### Demo headline

> **From a photo of an invoice to a refund rescue plan in 30 seconds.**

## 2. Why this direction can win

The product must score strongly in five areas:

| Judging dimension | What ComplyPilot must prove |
| --- | --- |
| Real-world value | One error can place identifiable input VAT at risk or delay an evidence package. Show the LKR value, not only an error count. |
| Innovation | Existing tools generate invoices and calculate VAT. ComplyPilot connects unstructured evidence, effective-dated law, reconciliation, recoverability, and human action. |
| Technical depth | Multimodal extraction, schema validation, deterministic tax rules, explainable matching, workflow orchestration, human gates, and audit provenance. |
| Alibaba Cloud usage | A genuine Qwen request, a genuine MuleRun execution, and a live deployment on Alibaba Cloud. Never name services that are not actually used. |
| Presentation | One clear transformation: messy document -> evidence finding -> LKR at risk -> corrective action -> improved what-if position -> human-approved package. |

The strongest competitive distinction is not “we make a compliant invoice.” Products already exist in Sri Lanka that advertise invoicing, VAT calculations, records, and accountant-ready exports. ComplyPilot must demonstrate the missing intelligence between records and a defensible refund/compliance decision.

## 3. Verified regulatory basis and source discipline

This is decision-support software, not tax advice. All rules must be source-dated and reviewed by a qualified human before production use.

### Facts used in the prototype

- The standard VAT rate displayed by the IRD is 18% from 1 January 2024.
- The general registration threshold displayed by the IRD is LKR 15 million per quarter or LKR 60 million over twelve months.
- Online VAT-return submission is mandatory for taxable periods from 1 July 2025.
- The Simplified VAT scheme was abolished from 1 October 2025 and replaced by a Risk-Based Refund Scheme for eligible exporters/projects.
- IRD guidance describes a 45-day refund-processing framework whose starting point can change when a Notice 2 is issued for missing schedules or schedule errors.
- Gazette 2481/22 specifies the revised tax-invoice format.
- Gazette 2500/106 changes the effective date in Gazette 2481/22 from 1 July 2026 to **1 October 2026**; all other matters remain unchanged.
- IRD has begun a phased ERP-to-RAMIS Web API programme. The guide describes supplier Schedule 1 data populating purchaser Schedule 2 and requiring purchaser review/approval.

### Source precedence

When sources conflict, apply this order:

1. Enacted Act and binding Gazette
2. Later binding amendment over an earlier one
3. IRD notice, circular, quick guide, and official reference page
4. Professional commentary
5. News, blogs, search results, and AI-generated summaries

Never hard-code a rule from a Budget proposal or secondary article when an enacted Act or later Gazette says otherwise.

### Primary sources

- IRD VAT page: https://www.ird.gov.lk/en/Type%20of%20Taxes/SitePages/Value%20Added%20Tax%20(VAT).aspx?menuid=1204
- Gazette 2481/22: https://www.ird.gov.lk/en/publications/Gazette_Documents/2026_2481-22_E.pdf
- Gazette 2500/106: https://www.ird.gov.lk/en/publications/Gazette_Documents/2026_2500_106_E.pdf
- Risk-Based Refund notice PN/SVAT/2025-01: https://www.ird.gov.lk/en/Lists/Latest%20News%20%20Notices/Attachments/718/PN_SVAT_2025-01_22092025_E.pdf
- Risk-Based Refund Circular SEC/2025/E/06: https://www.ird.gov.lk/en/publications/Circulars_Circulars/SEC_2025_E_06_E.pdf
- VAT Web API notice SEC/PN/VAT/2026-03: https://www.ird.gov.lk/en/Lists/Latest%20News%20%20Notices/Attachments/781/PN_VAT_2026-03_E.pdf
- VAT Web API guide: https://www.ird.gov.lk/en/eServices/Lists/FilingReturns/Attachments/17/VAT_WEB_API_Quick_Guide_v0_1.pdf
- VAT schedules: https://www.ird.gov.lk/en/Downloads/SitePages/Schedules.aspx?menuid=1604
- Schedule File Verifier: https://www.ird.gov.lk/en/Downloads/SitePages/Tools.aspx?menuid=1605

### Required metadata correction

`data/government-sources.json` currently records the publication date of Circular SEC/2025/E/06 as `2025-09-22`. The IRD circular listing/document identifies it as 19 November 2025. Re-verify the document, correct the metadata, and update `lastVerifiedAt`. Do not silently change legal metadata without recording the source and verification date.

## 4. Truth and safety boundaries

These rules are mandatory in code, UI text, README, video, and pitch.

### Never claim

- “This is the IRD risk score.”
- “Your refund will arrive on this date.”
- “RAMIS accepted this submission.”
- “ComplyPilot is connected to the live IRD portal/API” unless a real authorised integration is later obtained.
- “The invoice is legally corrected” merely because the prototype generated a preview.
- “Fraud detected” from a synthetic or heuristic result.
- “Zero errors,” “100% compliant,” or an accuracy percentage without a documented evaluation.
- “Immutable audit log” unless storage is actually append-only and tamper-resistant. The current client-side/in-memory log is replayable demo history, not immutable storage.

### Use these labels

- **ComplyPilot Refund Readiness** or **Estimated Compliance Readiness**
- **Not the IRD's official risk rating**
- **Statutory clock scenario — not a payment guarantee**
- **Draft corrected invoice** or **Correction request draft**
- **Mock government submission**
- **Simulated RAMIS feed**
- **Synthetic demonstration data**
- **Potential anomaly requiring human review**
- **Decision support only**

### Human authority rules

- Missing TINs, names, addresses, invoice numbers, and source facts must never be invented by AI.
- If the user is the purchaser, the system should draft a request for a corrected supplier invoice; it must not rewrite the supplier's legally issued invoice as if the purchaser issued it.
- If the authorised supplier is using the system, it may create a correction draft, but a human must approve issuance.
- A suggested serial number must be checked against the supplier's real sequence before approval.
- Low-confidence extraction or ambiguous entity matching must stop at a human-review gate.
- No live filing, external message, or government-system action occurs without explicit human authorisation.

## 5. Target user and golden use case

### Primary user

A finance manager or accountant at a Sri Lankan VAT-registered business - including, but not limited to, exporters affected by post-SVAT cash-flow and refund-evidence requirements.

### Golden use case

Serendib Export Works has a synthetic VAT claim under review. Its records include:

- A photographed supplier invoice with missing/uncertain mandatory fields
- A purchase/output schedule CSV
- A supplier-status snapshot whose date is not current enough for an automatic conclusion
- A synthetic Schedule 06 versus Customs/CUSDEC variance
- A configurable Notice 2 scenario

The system must answer:

1. Which evidence is incomplete or inconsistent?
2. Which source and effective-dated rule caused each finding?
3. How much input VAT is connected to each unresolved item?
4. Which action should the human take first?
5. What would the readiness position look like if selected actions were completed?
6. What evidence and approvals support the final package?

## 6. End-to-end product experience

```text
Invoice image / PDF-rendered image / VAT schedule / ERP export
                              |
                              v
                    Qwen document extraction
                    values + confidence + source
                              |
                              v
                 Zod schema and file validation
                              |
               +--------------+--------------+
               |                             |
               v                             v
       Effective-dated rule engine     Reconciliation engine
       exact calculations              weighted/explainable matching
               |                             |
               +--------------+--------------+
                              |
                              v
                    Evidence findings model
        rule + observation + provenance + LKR at risk + action
                              |
               +--------------+--------------+
               |                             |
               v                             v
        Actual readiness state        What-if scenario state
               |                             |
               +--------------+--------------+
                              |
                              v
                    Refund Rescue Simulator
                              |
                              v
                     Explicit human approval
                              |
                              v
          Evidence Passport / schedule export / mock adapter
```

## 7. Single source-of-truth data model

Extend the existing types rather than introducing a second backend framework. The Next.js Route Handlers are sufficient for the prototype.

The central case should resemble:

```ts
type EvidenceSource = {
  id: string;
  kind: "invoice" | "vat-schedule" | "ledger" | "supplier-snapshot" | "customs";
  fileName: string | null;
  mode: "USER_UPLOAD" | "SYNTHETIC_FIXTURE" | "OFFICIAL_SNAPSHOT";
  capturedAt: string;
  contentDigest?: string;
};

type ComplianceFinding = {
  id: string;
  category: "document" | "schedule" | "supplier" | "customs" | "refund";
  observedValue: unknown;
  expectedCondition: string;
  sourceEvidenceIds: string[];
  ruleId: string;
  ruleEffectiveFrom: string | null;
  officialSourceIds: string[];
  confidence: number;
  severity: "low" | "medium" | "high";
  lkrAtRisk: number;
  requiredAction: string;
  state: "open" | "needs-human" | "resolved" | "inactive";
  resolutionEvidenceIds: string[];
};

type RefundScenario = {
  actualScore: number;
  simulatedScore: number;
  actualLkrAtRisk: number;
  simulatedLkrAtRisk: number;
  selectedActionIds: string[];
  clockStartScenario: string | null;
  disclaimer: string;
};

type ClaimCase = {
  runId: string;
  dataMode: "SYNTHETIC_DEMO" | "USER_PROVIDED";
  evidence: EvidenceSource[];
  extraction: InvoiceExtraction | null;
  findings: ComplianceFinding[];
  reconciliation: ReconciliationBatch;
  actual: ReadinessPosition;
  scenario: RefundScenario;
  approvals: ApprovalEvent[];
  auditEvents: AuditEvent[];
};
```

Every screen, chat answer, score, graph, export, and audit event must derive from this same case object. Do not maintain a second hidden set of UI-only numbers.

## 8. Critical correction to the current demo state

The current code loads synthetic supplier and Customs findings from `lib/fixtures/demo-case.ts` even when the user uploads a new invoice. That can cause an uploaded document to appear connected to unrelated fixture values.

Implement explicit modes:

- **Synthetic demo run:** all evidence and values come from one named synthetic case.
- **User-provided run:** findings are produced only from uploaded/selected evidence. Fixture supplier, Customs, or LKR values must not be added automatically.
- The top bar must always display the current data mode.
- Reset returns to the named synthetic demo case.
- Uploading a user document starts a new user-provided case or asks the user whether to attach it to the existing synthetic case; it must not silently mix them.

## 9. Specialist agents and responsibility boundaries

This is a multi-agent workflow, but each agent has a narrow job and returns structured output.

### 9.1 Document Understanding Agent

**AI:** Qwen vision-language model through Alibaba Cloud Model Studio.

Responsibilities:

- Extract the defined invoice fields.
- Return field-level confidence and a source snippet/location when possible.
- Preserve uncertainty instead of guessing.
- Produce schema-valid JSON only.

It does not calculate the authoritative VAT result or decide legal compliance.

### 9.2 Temporal Compliance Agent

**Implementation:** deterministic effective-dated rules with grounded Qwen explanations.

Responsibilities:

- Select the rule pack using the invoice/supply date.
- Apply required-field, format, date, currency, and arithmetic checks.
- Link every finding to a rule ID and official source.
- Explain the result in English/Sinhala/Tamil without changing the deterministic outcome.

### 9.3 Reconciliation Agent

**Implementation:** deterministic normalisation and weighted matching; Qwen only for genuinely ambiguous entity candidates.

Responsibilities:

- Match invoice evidence to VAT schedule rows.
- Detect missing records, amount differences, TIN differences, likely duplicates, and date differences.
- Return a match score and the contribution of each matching feature.
- Send uncertain matches to a human.

Suggested explainable weights:

| Feature | Weight |
| --- | ---: |
| Exact normalised TIN | 40 |
| Normalised invoice serial | 25 |
| VAT/net/gross value within tolerance | 15 |
| Invoice/supply date proximity | 10 |
| Supplier-name similarity | 10 |

Suggested states:

- 85-100: high-confidence match
- 60-84: needs human confirmation
- Below 60: unmatched

These thresholds are product thresholds, not IRD thresholds. Store them in a versioned configuration file and test them.

### 9.4 Refund Readiness Agent

**Implementation:** deterministic and transparent.

Responsibilities:

- Combine only validated findings.
- Compute the actual readiness position.
- Calculate LKR at risk from actual evidence amounts, not fixed UI constants.
- Rank corrective actions by evidence urgency, LKR at risk, and readiness impact.
- Calculate a separate what-if scenario without mutating the actual case.
- Produce a statutory-clock scenario with a visible non-guarantee disclaimer.

Never present its score or readiness label as the IRD's private risk category.

### 9.5 Workflow Orchestrator

**Runtime:** MuleRun when configured; local deterministic orchestration as an honestly labelled fallback.

Responsibilities:

- Route structured evidence to agents.
- Run independent checks in parallel where safe.
- Stop on low confidence or a material disagreement.
- Create human checkpoints.
- Emit a visible workflow trace and real execution ID.
- Never override locally computed arithmetic or rule results with unvalidated LLM text.

### 9.6 Data Copilot

Responsibilities:

- Answer only from the active case and allow-listed sources.
- Cite the active rule/source.
- Clearly distinguish actual state from what-if state.
- Refuse to invent missing invoice facts.
- Never expose system prompts, credentials, unrelated cases, or raw private documents.

The Copilot is a supporting interface, not the demo's main innovation.

### 9.7 GUI Agent

Keep the GUI agent as a controlled technical bonus:

- It may operate only the bundled mock portal.
- It must pause for OTP/CAPTCHA and require human approval.
- It must record each action and result.
- It must never contact or claim to contact the live IRD portal.

Use it in Q&A or a longer demo. Do not let it consume the central three-minute product story.

## 10. Work package 1 — Evidence-driven case state

### Objective

Remove accidental mixing of fixtures and user uploads, and make provenance first-class.

### Existing files to update

- `lib/types.ts`
- `lib/runs/run-store.ts`
- `lib/workflows/orchestrator.ts`
- `app/api/analyze/route.ts`
- `lib/fixtures/demo-case.ts`
- `app/page.tsx`

### Tasks

1. Add explicit `SYNTHETIC_DEMO` and `USER_PROVIDED` case modes.
2. Give every fixture a shared `caseId` and evidence provenance.
3. Stop adding supplier/Customs fixtures to user-provided runs.
4. Derive claim value from findings connected to evidence.
5. Add a visible data-mode badge.
6. Ensure reset creates a clean synthetic run with a new run ID.
7. Ensure one user's upload cannot inherit another run's extraction.

### Acceptance tests

- Fresh load shows the named synthetic case and its expected values.
- Uploading an invoice starts/uses a user-provided case and removes unrelated synthetic supplier/Customs values.
- Uploading a schedule into the same user run reconciles with its invoice.
- Reset does not retain the prior extraction or schedule.
- API tests prove fixture and user data never mix.

## 11. Work package 2 — Smart Fix Studio

### Objective

Create the clearest visual transformation in the product.

### UX

Show a side-by-side workspace:

- Left: original invoice image and extracted fields
- Right: draft corrected invoice
- Field badges: verified, low-confidence, missing, format error
- Each failed check includes “Why?” with rule ID, effective date, and official source
- A money panel shows the VAT connected to the finding
- Actions: edit value, request supplier correction, generate authorised-supplier draft, approve draft

### Rules

- Do not invent missing TINs or business-registration values.
- Recalculate VAT/totals deterministically only when inputs are sufficient.
- Validate `net + VAT = gross` within a documented currency tolerance.
- Suggest, but do not assert, an invoice serial unless sequence evidence exists.
- Keep the original extraction immutable.
- Store who changed each field and why.

### Output

- Draft corrected invoice preview
- Correction request text for a purchaser to send to a supplier
- Structured corrected data
- Audit diff between original extraction and approved draft

### Acceptance tests

- A post-1-October-2026 invoice missing purchaser TIN and supply date fails the correct rules.
- A pre-1-October-2026 test applies the historical profile and does not claim the later format was mandatory.
- Missing values remain empty until a human supplies them.
- Correct totals are deterministic and unit-tested.
- The UI calls the output a draft, not a legally issued replacement.

## 12. Work package 3 — Batch VAT reconciliation

### Objective

Turn the current single exact match into explainable batch reconciliation.

### Tasks

1. Verify and map the official schedule columns used by the selected demo scenario.
2. Support at least invoice number, supplier/purchaser TIN, dates, net value, VAT, and gross value where available.
3. Normalise punctuation, spacing, case, leading zeros, and common company suffixes.
4. Apply weighted matching and expose the score breakdown.
5. Detect duplicate invoice serials and repeated value/date combinations as review signals.
6. Compute matched, review, unmatched, and duplicate totals in LKR.
7. Support a synthetic RAMIS Schedule 2 feed, clearly labelled simulated.
8. Export a reconciliation report.

### Important boundary

The current flexible demo CSV parser is not proof that an official IRD schedule file is accepted. Do not label an export “IRD-valid” until it has been tested against the official template/verifier. Until then use “draft schedule data” or “schedule-shaped export.”

### Acceptance tests

- `ABC Trading`, `ABC Trading Pvt Ltd`, and punctuation variations can be proposed as the same entity when other evidence agrees.
- A TIN disagreement cannot be hidden by a high name similarity.
- Amount differences show exact invoice, schedule, and variance values.
- Ambiguous matches stop for human review.
- Duplicate detection is explainable and never labelled proven fraud.
- A batch of at least 5,000 synthetic records completes within the chosen performance target, or the UI truthfully shows the supported limit.

## 13. Work package 4 — Refund Rescue Simulator

### Objective

Make the business outcome visual, interactive, and defensible.

### Separate actual and scenario states

The actual state reflects evidence that exists now. The scenario state reflects selected hypothetical fixes.

Clicking “simulate fix” must not resolve the actual finding. An actual finding becomes resolved only when required evidence is supplied/approved or an authorised demo action explicitly applies a correction.

### Required outputs

- Actual readiness score and component breakdown
- Simulated readiness score and component breakdown
- Actual LKR at risk
- Simulated LKR at risk
- Ranked rescue actions
- Before/after waterfall or bridge visual
- Statutory-clock scenario
- Assumptions and uncertainty

### Suggested UI language

```text
Actual position: 68/100 — Needs review
Potential position after selected actions: 89/100 — Approval-ready
Potential VAT exposure reduced: LKR 4.2M -> LKR 0.8M
This is a ComplyPilot what-if model, not an IRD risk rating or refund guarantee.
```

### Acceptance tests

- Every score point can be reproduced from the versioned configuration.
- Every LKR value traces to evidence or is labelled synthetic.
- Scenario actions do not mutate actual findings.
- Applying a real correction creates an audit event and changes actual state through recomputation.
- Notice 2 changes only the scenario clock basis defined by the source-backed rule.
- The system never outputs a guaranteed payment date.

## 14. Work package 5 — Temporal regulation and regulatory watch

### Objective

Prove that ComplyPilot handles changing law better than a generic chatbot.

### Killer test cases

1. Invoice dated 20 September 2026: later invoice specification is not yet mandatory.
2. Invoice dated 10 October 2026: October rule pack applies.
3. Ask when the invoice specification became effective: answer 1 October 2026 and cite both the original and amending Gazette.
4. Ask the general registration threshold: prefer enacted/current official material over the earlier LKR 36M Budget proposal.

### Regulatory watch behaviour

- A scheduled fetch may identify a source change.
- Qwen may summarise the textual difference.
- It must create a proposed rule-pack change, not automatically alter production compliance logic.
- A human tax reviewer must approve the rule update.
- Store source URL, retrieval date, content hash, effective date, reviewer, and change reason.

### Acceptance tests

- Later amendments override earlier effective dates.
- The UI shows the complete source chain.
- An unreviewed source change cannot alter an authoritative rule result.
- Answers distinguish publication date from effective date.

## 15. Work package 6 — Live Qwen and MuleRun proof

### Qwen requirements

- Use Alibaba Cloud Model Studio with a real key stored only in server-side environment variables.
- Return schema-constrained extraction.
- Validate the response with Zod.
- Display `LIVE QWEN` only after a successful live response.
- Display `DEMO FALLBACK` with the reason when live extraction is unavailable.
- Record model name, latency, and run ID without logging sensitive document content.

### MuleRun workflow

Publish a real pre-flight workflow with these conceptual stages:

1. Receive a structured, schema-validated case payload.
2. Validate the workflow input.
3. Route document, reconciliation, and readiness checks.
4. Branch to human review on low confidence or disagreement.
5. Return schema-valid findings/advisory results.
6. Emit a real execution ID.

The local deterministic rule engine remains authoritative for arithmetic, rule selection, score, and filing gates. MuleRun orchestration output is accepted only after schema validation and consistency checks.

### Acceptance tests

- One recorded run shows `LIVE QWEN` with a real extraction.
- One recorded run shows `LIVE MULERUN` and an execution ID visible in the UI.
- An invalid MuleRun response fails closed and the UI reports local fallback honestly.
- A disagreement between MuleRun and local rules becomes a trace event/human-review item; it cannot silently overwrite the local result.

## 16. Work package 7 — First-place UI hierarchy

The UI must answer three questions within five seconds:

1. How much VAT value is at risk?
2. Why is it at risk?
3. What should the human do next?

### Main screen order

1. **Hero:** actual readiness, LKR at risk, blockers, data mode
2. **Evidence input:** upload invoice/schedule or load golden case
3. **Refund Rescue Simulator:** actual versus selected what-if position
4. **Priority actions:** LKR unlocked and score impact
5. **Reconciliation summary:** matched/review/unmatched/duplicate
6. **Workflow trace:** Qwen/MuleRun/human gates

### Visual requirements

- Use one main accent colour, clear success/warning/error states, and restrained animation.
- Animate the before/after value only when the underlying scenario changes.
- Keep official-source links near the finding they support.
- Clearly badge live, fallback, mock, and synthetic states.
- Avoid a dashboard full of unrelated cards.
- Preserve keyboard accessibility, visible focus, semantic labels, and mobile responsiveness.

### Supporting screens

- Smart Fix Studio
- Evidence graph
- Reconciliation workbench
- Rules and Time Machine
- Mock filing/human approval
- Audit trail and Evidence Passport
- Data Copilot

## 17. Golden synthetic dataset and evaluation

Use synthetic data shaped by public official formats. Never show a real company's TIN, turnover, counterparties, or invoice image in a public demo without explicit written permission and complete redaction.

### Minimum golden cases

1. Clean pre-October invoice
2. Clean post-October invoice
3. Missing purchaser TIN
4. Invalid serial format
5. Missing supply date
6. Arithmetic inconsistency
7. Exact schedule match
8. Fuzzy company-name match with exact TIN
9. Conflicting TIN despite similar name
10. Amount mismatch
11. Missing schedule row
12. Suspected duplicate
13. Stale supplier-status snapshot
14. Customs/export variance
15. Notice 2 clock scenario

### Evaluation metrics

- Field extraction accuracy by field, not one vague overall score
- Rule-check precision/recall on labelled synthetic cases
- Reconciliation match accuracy on known pairs
- False-positive rate for duplicate/anomaly warnings
- Median and p95 processing latency
- Percentage of findings with complete provenance and citations
- Percentage of high-risk/low-confidence cases correctly sent to a human

Record dataset size and method beside every metric. Never present a synthetic evaluation as production performance.

## 18. Testing and quality gates

Add a test framework if one is not present. Tests must cover the business logic, not only UI rendering.

### Unit tests

- Invoice rule selection before and after 1 October 2026
- TIN, dates, invoice serial, currency, required fields, and amount arithmetic
- Schedule parser and header aliases
- Matching score and thresholds
- LKR-at-risk aggregation
- Actual versus scenario isolation
- Score calculation boundaries
- Government-source precedence
- MuleRun response validation

### API/integration tests

- Image upload validation and maximum size
- CSV upload validation and malformed input
- Run isolation
- User/fixture data separation
- Live-Qwen failure -> labelled fallback
- MuleRun failure -> labelled local fallback
- Resolve/apply correction requires correct evidence/action
- Chat answers are grounded in the active run

### End-to-end tests

- Load golden case
- Upload invoice
- Review extraction
- Apply date-aware checks
- Open Smart Fix Studio
- Upload schedule
- Reconcile
- Simulate rescue actions without changing actual state
- Apply an authorised correction
- Approve mock filing
- Export Evidence Passport

### Required commands before every release

```bash
npm run typecheck
npm run build
```

Add and run automated tests once the test runner is configured. Also run `git diff --check` before committing.

## 19. Security and privacy

- Keep Model Studio, MuleRun, and infrastructure credentials server-side.
- Never commit `.env`, taxpayer documents, credentials, tokens, or production TIN data.
- Restrict uploads by MIME type, extension, size, and row count.
- Treat OCR text, filenames, CSV cells, portal text, and retrieved webpages as untrusted input.
- Use structured prompts and schema validation to reduce prompt-injection risk.
- Redact sensitive values from logs and error messages.
- Add rate limits to public AI endpoints.
- Isolate runs by secure session/tenant in any multi-user deployment.
- Delete temporary uploads according to a documented retention policy.
- Use encryption in transit; production storage should also be encrypted at rest.
- Require human confirmation for consequential actions.
- The hash in the current Evidence Passport is tamper-evident content verification, not a digital signature or government endorsement.

## 20. Alibaba Cloud and deployment plan

### Services that must genuinely work

- **Alibaba Cloud Model Studio / Qwen:** multimodal invoice extraction and grounded explanation.
- **MuleRun:** visible workflow execution and human checkpoint.
- **Alibaba Cloud ECS:** primary hosted prototype.

### Optional only if actually implemented

- OSS for encrypted document/evidence storage
- AnalyticDB or another approved data store for durable cases and source-indexed retrieval
- Function Compute for scheduled regulatory-source checks

Do not add services only to increase a slide count. Each named service needs a clear request path, screenshot/log, and reason it is necessary.

### Deployment acceptance

- Public HTTPS URL loads without local setup.
- Golden synthetic demo works after a cold start.
- Server-side environment variables are configured.
- Qwen and MuleRun status badges reflect actual calls.
- The app remains usable with an honest local/deterministic fallback if an external AI service fails.
- The mock portal cannot be mistaken for the live IRD portal.

## 21. Three-minute finals demo

### 0:00-0:15 — The physical problem

Hold up a paper invoice.

> “Sri Lanka is moving to a new tax-invoice format and digital VAT workflows, but businesses still work with paper, PDFs, and fragmented schedules. The problem is not calculating 18%; it is knowing which evidence error can place real VAT money at risk.”

### 0:15-0:40 — Live Qwen extraction

- Upload the golden invoice photo.
- Show `LIVE QWEN`.
- Show structured fields and confidence.

> “Qwen understands the unstructured invoice. Deterministic rules — not the language model — perform the tax checks.”

### 0:40-1:05 — Temporal compliance and Smart Fix

- Show that the invoice date selects the October 2026 rule pack.
- Open the side-by-side corrected draft.
- Show missing purchaser TIN/supply date and source citations.

> “The system applies the rule that was valid on the transaction date. It never invents a missing TIN; it asks the authorised human or drafts a correction request.”

### 1:05-1:35 — Reconciliation

- Upload the schedule or load the simulated Schedule 2 feed.
- Show high-confidence matches, a human-review match, and a value mismatch.

> “ComplyPilot reconciles evidence, not only file structure. Every match score is explainable.”

### 1:35-2:10 — Signature wow moment

- Open Refund Rescue Simulator.
- Select the three actions.
- Animate actual 68/100 versus potential 89/100.
- Animate LKR 4.2M exposure reducing in the scenario.

> “This is not the IRD's private score. It is our transparent evidence-readiness model. Every point and rupee traces back to a document, rule, and required action.”

### 2:10-2:35 — Trust and human control

- Open the evidence graph.
- Approve only the mock package.
- Export Evidence Passport.

> “AI proposes and explains. Deterministic rules verify. A human approves. The evidence trail records exactly what happened.”

### 2:35-3:00 — Real stack and close

- Show Qwen mode, MuleRun execution ID, and Alibaba Cloud deployment architecture.

> “ComplyPilot is the intelligence layer between messy business records and Sri Lanka's digital tax infrastructure — turning preventable evidence problems into an actionable VAT recovery plan.”

### Keep out of the central three-minute demo

- Long Data Copilot conversation
- Full GUI-agent portal run
- Generic feature tour
- Fraud graph based only on synthetic anomalies
- Architecture details before the audience understands the business result

Use those as Q&A evidence or in a longer judge walkthrough.

## 22. Judge Q&A answers

### “Is this the IRD risk score?”

No. The IRD's private methodology is not reproduced. ComplyPilot uses a published, versioned evidence-readiness formula and shows every factor. It is decision support.

### “Are you connected to RAMIS?”

No live connection is claimed. The prototype uses a simulated feed and controlled mock portal because no unrestricted public sandbox was verified. The adapter boundary follows the documented direction of ERP-to-RAMIS integration.

### “Why AI? Why not OCR plus rules?”

Qwen handles document layout, noisy photos, multilingual text, and ambiguous entity candidates. Deterministic code handles arithmetic, effective dates, validation, score, and gates. The combination is more reliable and explainable than either alone.

### “What is different from accounting software?”

Accounting software records transactions and creates reports. ComplyPilot cross-checks evidence across documents and systems, applies the correct rule version, attaches LKR exposure to each finding, and recommends the evidence action with the highest recovery value.

### “How did you train the fraud/risk model?”

Do not claim a trained official model. The core readiness calculation is transparent and deterministic. Synthetic data is used for test coverage and demonstration; anomaly warnings are human-review signals.

### “What happens when AI is wrong?”

Schema validation, confidence thresholds, deterministic recomputation, source citations, disagreement checks, and human approval prevent a language-model answer from becoming an authoritative filing decision.

## 23. Team and Git workflow

With two developers, split ownership by contract:

### Developer A — domain/backend

- Types and case state
- Qwen extraction
- Rule engine
- Reconciliation
- Refund scenario
- MuleRun
- API and tests

### Developer B — UI/demo

- Main dashboard hierarchy
- Smart Fix Studio
- Reconciliation workbench
- Refund Rescue visual
- Responsive/accessibility work
- Demo assets and video

### Shared rules

- Freeze `lib/types.ts` changes through a short agreed API contract before parallel UI/backend work.
- Work in small feature branches and atomic commits.
- Do not both edit the same large component without coordination.
- Pull/rebase before integration; never overwrite another member's uncommitted changes.
- Do not commit credentials or real taxpayer data.
- Run typecheck, tests, build, and diff check before merging.
- Each commit should complete one vertical slice or one safe refactor.

## 24. AI coding-agent execution rules

An AI coding agent implementing this plan must:

1. Inspect `git status`, current diffs, and recent commits before editing.
2. Preserve unrelated teammate changes and untracked user files.
3. Read the existing types, orchestrator, rule pack, fixtures, and affected UI before changing them.
4. Implement one work package or coherent vertical slice at a time.
5. Reuse the existing Next.js architecture instead of adding FastAPI or another runtime without a proven need.
6. Use deterministic code for money, totals, dates, thresholds, matching gates, and readiness scoring.
7. Use Qwen for extraction, ambiguity resolution, explanation, and multilingual interaction.
8. Use structured schemas for every AI/tool boundary.
9. Add tests with each business-logic change.
10. Keep actual state separate from hypothetical scenario state.
11. Never invent legal facts, missing invoice fields, production accuracy, live integrations, or official risk outcomes.
12. Update documentation when behaviour or boundaries change.
13. Run verification before committing.
14. Report exactly what is live, simulated, fixture-based, fallback, or roadmap.

## 25. Dependency-ordered build sequence

This sequence is based on product dependencies, not on reducing the vision.

1. Correct government-source metadata and add legal regression tests.
2. Create the single evidence-driven case model and separate demo/user modes.
3. Remove fixture leakage into user uploads.
4. Make scores and LKR exposure derive from evidence.
5. Build Smart Fix Studio with immutable original and human-approved draft.
6. Upgrade reconciliation to weighted, explainable batch matching.
7. Separate actual and what-if states; build Refund Rescue Simulator.
8. Publish and verify the live MuleRun workflow.
9. Polish the UI around the golden story.
10. Build the synthetic evaluation set and publish honest metrics.
11. Deploy the primary prototype to Alibaba Cloud ECS.
12. Record the three-minute demo and prepare Q&A evidence.

## 26. Definition of done

The first-place version is ready only when all of the following are true:

- A judge can upload a supported invoice image and receive a genuine Qwen extraction or an honestly labelled fallback.
- User-provided evidence never inherits unrelated synthetic findings.
- The correct rule pack is selected from the document date.
- The Smart Fix screen never invents missing facts and clearly labels its output as a draft/request.
- Reconciliation results are explainable and trace to uploaded/synthetic evidence.
- LKR-at-risk values derive from the case, not hard-coded presentation numbers.
- The actual case and what-if simulation remain separate.
- Every score point and recommended action is reproducible.
- A human approval gate blocks the controlled mock submission.
- The Evidence Passport records sources, findings, approvals, and integrity metadata accurately.
- One real Qwen call and one real MuleRun execution are captured.
- The hosted prototype runs on Alibaba Cloud and has a working golden demo path.
- Tests, typecheck, and production build pass.
- README, submission statement, video narration, and UI use the same truthful language.
- The three-minute demo tells one story and visibly changes both readiness and LKR exposure.

## 27. Final pitch

> “Sri Lankan accounting tools can create invoices. ComplyPilot goes further. It understands messy evidence, applies the rule that was valid on the transaction date, reconciles supplier and government-facing records, identifies the exact VAT money at risk, and shows the human how to protect it before filing. AI understands and explains; deterministic rules verify; humans approve.”
