# ComplyPilot RefundShield — Development Agent Brief

This file is the implementation contract for the AI development agent. Build the smallest reliable end-to-end hackathon product described here. Preserve the existing visual design where practical and prefer a working vertical slice over many incomplete features.

## 1. Product definition

**Product:** ComplyPilot RefundShield  
**Primary user:** Sri Lankan exporter finance and tax teams  
**One-line promise:** Turn invoices and supporting records into an explainable, human-reviewed VAT refund-readiness package.

### Positioning

Accounting products such as SimpleBooks create invoices, calculate VAT, track customers and export PDFs. ComplyPilot must not become another invoice generator.

> Your accounting system creates invoices. ComplyPilot proves that the VAT refund evidence package is ready.

ComplyPilot is an optional compliance layer above PDF invoices, paper invoices, Excel files and accounting-system exports. It connects each invoice to the VAT schedule, supplier evidence, ledger record and Customs/CUSDEC evidence.

## 2. Required hackathon outcome

Implement one complete journey:

1. A user uploads or selects a paper-invoice image.
2. Qwen extracts structured invoice fields with field-level confidence.
3. The Document Compliance Agent identifies missing or inconsistent fields.
4. The Supplier & Reconciliation Agent compares the invoice with synthetic VAT-schedule, supplier, ledger and CUSDEC records.
5. The Refund Readiness Agent applies deterministic rules and returns a transparent score.
6. The UI shows claim value linked to unresolved evidence.
7. A human resolves the blockers.
8. The score and value under review update immediately.
9. The human approves a mock submission.
10. Every agent and human action appears in a downloadable audit trail.

The demo must remain usable when an external service is unavailable. A fallback may use synthetic fixtures, but the UI must label the run as `DEMO FALLBACK`; it must never present fallback data as a live model response.

## 3. Technology decisions

| Layer | Decision |
| --- | --- |
| Web application | Next.js App Router with TypeScript |
| Styling | Preserve the existing CSS first; add Tailwind only if already configured |
| Server APIs | Next.js Route Handlers |
| AI model | Alibaba Cloud Model Studio, `qwen3.7-plus` |
| AI transport | Model Studio OpenAI-compatible endpoint |
| Response validation | JSON Schema at the model boundary and Zod in the application |
| Workflow | MuleRun adapter with a deterministic local orchestrator fallback |
| Scoring | Plain TypeScript rules; never an LLM-generated number |
| Persistence for demo | In-memory or local synthetic fixture state plus JSON audit export |
| Deployment | Vercel from the GitHub `main` branch |

### Do not adopt Vercel Eve for this submission

Eve is a promising durable-agent framework, but it is in public preview and overlaps with MuleRun orchestration, approvals and subagents. Do not add a second orchestration runtime today. List Eve only as a post-hackathon option.

## 4. Suggested project structure

```text
app/
├── api/
│   ├── analyze/route.ts
│   ├── resolve/route.ts
│   └── approve/route.ts
├── page.tsx
└── globals.css
components/
├── upload-panel.tsx
├── readiness-score.tsx
├── claim-value-card.tsx
├── blocker-list.tsx
├── evidence-graph.tsx
├── regulatory-time-machine.tsx
└── audit-trail.tsx
lib/
├── agents/
│   ├── document-agent.ts
│   ├── reconciliation-agent.ts
│   └── readiness-agent.ts
├── ai/
│   ├── qwen-client.ts
│   ├── extraction-schema.ts
│   └── prompts.ts
├── rules/
│   ├── scoring.ts
│   └── rule-profiles.ts
├── workflows/
│   ├── orchestrator.ts
│   ├── local-adapter.ts
│   └── mulerun-adapter.ts
├── audit/
│   └── audit-log.ts
└── fixtures/
    └── demo-case.ts
```

Keep `ComplyPilot-RefundShield-UI-Demo.html` as the visual reference until the Next.js page reaches feature parity.

## 5. Agent responsibilities

### Document Compliance Agent

- Accept invoice images or PDFs.
- Extract seller name, seller TIN/VAT number, buyer details, invoice number, invoice date, currency, line items, net total, VAT total and gross total.
- Return a confidence value and source text for every extracted field.
- Recalculate totals using deterministic code.
- Apply the rule profile selected by effective date.
- Route ambiguous or low-confidence fields to human review.

### Supplier & Reconciliation Agent

- Match an invoice to a VAT-schedule row.
- Match it to the ledger transaction.
- Match export evidence to the synthetic CUSDEC record.
- Show the effective date of supplier evidence.
- Return explicit matched, mismatched and missing records.
- Never claim live IRD verification unless an authorised live source was actually queried.

### Refund Readiness Agent

- Combine only validated findings from the specialist agents.
- Call the deterministic scoring function.
- Calculate input VAT value connected to unresolved evidence.
- Produce an ordered action plan.
- Create the statutory-clock scenario as an informational simulation.
- Stop at a human approval gate before mock submission.

## 6. Minimum API contract

### `POST /api/analyze`

Input: multipart form data containing an invoice file and optional fixture IDs.

Output shape:

```json
{
  "runId": "RUN-001",
  "mode": "LIVE_QWEN",
  "invoice": {
    "invoiceNumber": {
      "value": "INV-1042",
      "confidence": 0.98,
      "source": "Invoice No: INV-1042"
    }
  },
  "findings": [
    {
      "id": "F-001",
      "severity": "high",
      "status": "open",
      "message": "VAT schedule value differs from the invoice",
      "evidenceValueLkr": 125000,
      "sourceIds": ["INV-1042", "VAT-ROW-38"],
      "ruleId": "RECON-001",
      "requiredAction": "Confirm and correct VAT schedule row 38"
    }
  ],
  "score": {
    "total": 68,
    "components": {
      "documents": 24,
      "schedule": 15,
      "supplier": 14,
      "customs": 10,
      "package": 5
    }
  },
  "claimValueUnderReviewLkr": 4200000,
  "auditEvents": []
}
```

`mode` must be either `LIVE_QWEN` or `DEMO_FALLBACK`.

### `POST /api/resolve`

Accept a finding ID and a human correction. Re-run only the affected deterministic checks, recalculate the score and append an audit event.

### `POST /api/approve`

Require an explicit human confirmation. Produce a mock submission receipt and append an audit event. This route must not access the live IRD portal.

## 7. Transparent scoring model

The score has a maximum of 100 points:

| Component | Maximum |
| --- | ---: |
| Document completeness | 30 |
| Schedule reconciliation | 25 |
| Supplier evidence | 20 |
| Customs reconciliation | 15 |
| Submission package | 10 |
| **Total** | **100** |

Rules must be visible in code and covered by unit tests. The demo fixture starts at `68/100`; resolving its three blockers moves it to `89/100`. Do not describe this internal score as the IRD's official risk classification.

## 8. Required UI states

- Initial demo case loaded
- Uploading
- Live Qwen analysis
- Demo fallback, clearly labelled
- Three open blockers
- Low-confidence human-review item
- Finding resolved
- Score recalculated
- Mock approval completed
- External API failure with retry
- Downloadable audit JSON

The most important screen elements are:

1. Readiness score with component breakdown
2. `Claim Value Under Review` rather than “predicted loss”
3. Prioritised blocker queue
4. Evidence chain from document to rule to human action
5. Qwen live/fallback status
6. Human approval control

## 9. One wow feature

Implement the **Regulatory Time Machine** after the core journey works.

- Provide at least two versioned rule profiles.
- Display the profile name, effective date and source.
- Re-run invoice validation when the user changes the profile.
- Explain which findings changed and why.
- Never silently apply a future rule to an earlier document.

Treat the 45-day Clock Twin as secondary. It can remain a clearly labelled informational simulation if time is limited.

## 10. Qwen integration requirements

- Call Model Studio only from server-side code.
- Read the API key from `DASHSCOPE_API_KEY`.
- Read the OpenAI-compatible base URL from `DASHSCOPE_BASE_URL` because it varies by workspace and region.
- Use `QWEN_MODEL=qwen3.7-plus` as the default.
- Request strict JSON Schema output where supported.
- Validate all model output with Zod before using it.
- Set timeouts and return a controlled fallback response on failure.
- Do not log API keys, full taxpayer documents or unredacted sensitive fields.

Example environment file:

```text
DASHSCOPE_API_KEY=
DASHSCOPE_BASE_URL=
QWEN_MODEL=qwen3.7-plus
WORKFLOW_MODE=local
MULERUN_API_URL=
MULERUN_API_KEY=
```

Commit only `.env.example`; never commit a populated `.env` or `.env.local`.

## 11. Evidence and audit requirements

Every finding must contain:

- Finding ID
- Source document IDs
- Applied rule ID and rule-profile version
- Severity
- Confidence when AI extraction is involved
- Human-readable explanation
- Required human action
- Current status
- Evidence value in LKR when relevant

Every audit event must contain:

- Event ID
- Timestamp
- Run ID
- Actor type: agent or human
- Actor name
- Action
- Before/after values where applicable
- Rule-profile version

## 12. Security and claims boundaries

- Synthetic demo data only.
- Do not store taxpayer files in browser local storage.
- Keep credentials server-side.
- Validate file type and size.
- Escape or safely render extracted text.
- No unattended tax filing.
- No live IRD credentials.
- No guarantee of a refund or processing date.
- No claim that ComplyPilot reproduces an official IRD risk model.
- Display that the product is decision support and not legal, accounting or tax advice.

## 13. Acceptance criteria

The MVP is complete only when all of the following pass:

- [ ] The project starts with one documented command.
- [ ] The existing visual concept is available in the Next.js UI.
- [ ] A paper-invoice image can be submitted.
- [ ] At least one real Qwen request succeeds with valid credentials.
- [ ] Qwen output is schema-validated.
- [ ] Live and fallback modes are visibly different.
- [ ] Three fixture blockers appear with evidence sources and actions.
- [ ] The score is produced by deterministic TypeScript rules.
- [ ] Resolving blockers changes `68` to `89` for the demo fixture.
- [ ] Claim value under review decreases after corrections.
- [ ] Mock submission requires explicit human approval.
- [ ] Audit events can be downloaded as JSON.
- [ ] No secret is present in the Git repository or browser bundle.
- [ ] The Vercel URL works in an incognito browser.
- [ ] README setup instructions match the implementation.

## 14. Development order for today

1. Scaffold Next.js and reproduce the existing dashboard without redesigning it.
2. Define Zod schemas, fixture data and the deterministic scoring tests.
3. Implement the local three-agent orchestrator.
4. Implement the Qwen document-extraction call.
5. Connect upload, findings, resolve and approval UI states.
6. Add the audit export.
7. Add the MuleRun adapter if credentials and documentation are ready.
8. Add the Regulatory Time Machine.
9. Deploy to Vercel and run the full demo twice.
10. Record the three-minute video only after the hosted flow is stable.

## 15. Two-person ownership

### Developer A — frontend and deployment

- Next.js setup and migration of the existing UI
- Upload and analysis states
- Evidence Graph, score and blocker interactions
- Responsive layout and Vercel deployment
- Demo recording

### Developer B — AI and workflow

- Extraction and response schemas
- Qwen client and prompt
- Three agent modules
- Reconciliation fixture and scoring tests
- MuleRun/local workflow adapters
- Audit events and failure handling

Use short-lived feature branches and merge only after the main demo journey works locally.

## 16. Demo script

1. State: “A valid-looking invoice does not mean a refund-ready claim.”
2. Upload the synthetic paper invoice.
3. Show Qwen-extracted fields and confidence.
4. Run invoice, schedule, supplier and Customs reconciliation.
5. Show `68/100`, three blockers and `LKR 4.2M` under review.
6. Open one evidence chain and explain the source-to-rule-to-action path.
7. Resolve the three blockers.
8. Show the score move to `89/100` and the reduced review value.
9. Switch the Regulatory Time Machine profile and explain the changed rule.
10. Approve the mock submission and download the audit trail.

## 17. References

- [SimpleBooks VAT Invoice Generator](https://simplebooks.com/vat-invoice/)
- [SimpleBooks accounting dashboard](https://simplebooks.com/srilanka/dashboard/accounting-software/)
- [Alibaba Cloud Model Studio Qwen API](https://www.alibabacloud.com/help/en/model-studio/qwen-api-reference)
- [Alibaba Cloud visual understanding](https://www.alibabacloud.com/help/en/model-studio/vision-model)
- [Vercel Next.js deployment](https://vercel.com/docs/frameworks/full-stack/nextjs)
- [Vercel Eve repository — post-hackathon evaluation only](https://github.com/vercel/eve)

