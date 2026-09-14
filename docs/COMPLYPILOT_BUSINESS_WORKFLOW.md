# ComplyPilot VAT — Continuous Business Workflow

## 1. Product Direction

ComplyPilot VAT is not a one-time tool where a business uploads every document, runs one analysis, and immediately submits a VAT return.

It is a continuous VAT compliance workspace. A business creates its profile once, adds invoices and supporting evidence throughout each taxable period, resolves issues gradually, and submits only after an authorised person completes the period-closing review.

> **Product statement:** ComplyPilot continuously organises and validates VAT records during the taxable period, uses AI to identify and explain compliance issues early, and prepares an evidence-backed submission for final human approval.

## 2. Sri Lankan VAT Operating Context

The business workflow must distinguish between VAT payments, VAT returns, and invoice transmission.

- A VAT return taxable period may be monthly or quarterly.
- Monthly filing means one return per month, or up to 12 returns per year.
- Quarterly filing means one return every three months, or four returns per year. It does not mean one return every four months.
- VAT payment for a particular month is generally due on or before the twentieth day of the following month.
- The VAT return is generally due on or before the last day of the month following the end of the applicable taxable period.
- Online VAT-return submission has been mandatory for taxable periods beginning on or after 1 July 2025.
- VAT invoice transmission through the RAMIS Web API is a real-time operational flow and is separate from the final VAT-return submission.

The business's registered filing frequency and current IRD instructions must determine the actual calendar shown in the product.

Official references:

- [IRD — Value Added Tax](https://www.ird.gov.lk/en/type%20of%20taxes/sitepages/value%20added%20tax%20%28vat%29.aspx)
- [IRD — 2026 Tax Calendar](https://www.ird.gov.lk/en/publications/Tax%20Calendar_Documents/Tax_Calendar_2026_E.pdf)
- [IRD — VAT Invoice Integration Between ERP Systems and RAMIS](https://www.ird.gov.lk/en/Lists/Latest%20News%20%20Notices/Attachments/781/PN_VAT_2026-03_E.pdf)
- [IRD — How to Submit Invoices Through the VAT Web API](https://www.ird.gov.lk/en/eServices/Lists/FilingReturns/Attachments/17/VAT_WEB_API_Quick_Guide_v0_1.pdf)

## 3. End-to-End Business Process

```text
Create the business profile once
              ↓
Open or select a VAT taxable period
              ↓
Add invoices and evidence throughout the period
              ↓
Run continuous AI extraction, validation and reconciliation
              ↓
Resolve evidence and compliance tasks over time
              ↓
Perform the period-closing review
              ↓
Obtain final approval from an authorised human
              ↓
Submit through the RAMIS simulator or an approved live adapter
              ↓
Store the acknowledgement, evidence passport and audit trail
```

## 4. Stage 1 — Business Onboarding

The user should create a reusable business profile instead of entering the same information for every document.

The profile should contain:

- Legal business name
- TIN
- VAT registration status and relevant registration details
- Filing frequency: monthly or quarterly
- Accounting calendar
- Branches or business locations
- Authorised accountant or tax representative
- ERP or accounting system
- Notification contacts
- RAMIS integration status

Profile values must come from the business or verifiable source documents. The AI must never invent a TIN, VAT registration status, filing frequency, or other taxpayer fact.

## 5. Stage 2 — VAT Period Workspace

Each taxable period is a separate workspace under the business profile.

Example:

```text
Business: Serendib Export Works
Filing frequency: Monthly
Current period: September 2026
Payment due: 20 October 2026
Return due: 31 October 2026
Status: Collecting records
```

Users should be able to move between periods:

```text
July 2026       Submitted
August 2026     Submitted
September 2026  Collecting
October 2026    Not started
```

The application must calculate dates from the stored filing profile and rule pack rather than displaying permanently hard-coded demo dates.

## 6. Stage 3 — Continuous Document Collection

A business may add records every day, every week, or whenever documents become available. Adding a document must not trigger a final submission.

Supported evidence can include:

- Paper invoice photographs
- Scanned invoice PDFs
- Electronic invoices
- ERP exports
- VAT Schedule CSV files
- Purchase and sales ledgers
- Credit and debit notes
- Customs or export evidence
- Supplier corrections and supporting documents

Every uploaded item should be saved as a draft period record with its original source, upload time, processing state and content digest.

Example period inbox:

```text
Invoice Inbox — September 2026

124  Processed
 96  Matched
 18  Need review
  7  Missing evidence
  3  Possible duplicates
```

## 7. Stage 4 — Continuous AI Processing

Whenever a new document is added, the orchestrator should run the relevant agents in the background.

1. **Document Agent** extracts structured invoice data with Qwen vision/OCR.
2. **Rule Agent** checks the extracted fields against the applicable Sri Lankan VAT rule pack.
3. **Smart Fix Agent** separates safe draft corrections from facts that require human evidence.
4. **Reconciliation Agent** compares invoice, ledger and schedule records using explainable exact and semantic matching.
5. **Risk Agent** recalculates readiness and the VAT value affected by unresolved issues.
6. **Rescue Planner Agent** ranks the next actions by financial impact and urgency.

Processing a new record updates the period dashboard, but it does not file the return or approve a tax claim.

## 8. Stage 5 — Task-Based Resolution

The application should translate findings into small tasks that users can complete over several sessions.

Example:

```text
Today's Tasks

3 invoices require a purchaser TIN from source evidence
2 invoices may be duplicates
1 invoice has a VAT amount mismatch
5 high-confidence matches are ready for review
```

Recommended task statuses:

- `Open`
- `Waiting for evidence`
- `Ready for review`
- `Resolved`
- `Rejected`

Progress must be saved after each action. A business should be able to resolve one issue today and continue with the remaining issues later.

## 9. Stage 6 — Schedule Reconciliation

ComplyPilot should compare internal purchase-ledger records with supplier/RAMIS Schedule 02 candidates and explain every recommendation.

Example high-confidence candidate:

```text
RAMIS record:  ABC Trading Pvt Ltd
Ledger record: ABC Traders (Pvt) Limited

Same TIN                 Yes
Same invoice number      Yes
Same taxable/VAT amount  Yes
Supplier-name variation  Review note

AI match confidence: 98%
Recommendation: Approve after human review
```

Example mismatch:

```text
Invoice VAT:  LKR 180,000
Ledger VAT:   LKR 162,000
Difference:   LKR 18,000

Recommendation: Do not approve yet. Obtain source evidence and determine whether a tax credit or debit note is required.
```

An AI recommendation must not become the official `Matched` status automatically. The authorised purchaser must approve the record before it is treated as matched.

## 10. Stage 7 — Period Closing

At the end of the taxable period, ComplyPilot should present a dedicated closing workspace.

```text
September 2026 VAT Close

✓ 124 invoices processed
✓ 96 schedule records matched
✓ No known duplicate submissions
! 2 records still require evidence
! LKR 180,000 VAT requires review

Status: Not ready for final approval
```

When all mandatory gates pass:

```text
Status: Ready for human review
```

Period-closing gates should include:

- Required records processed
- Applicable invoice rules checked
- Material mismatches reviewed
- Duplicate checks completed
- Required schedules prepared
- VAT totals reconciled
- Evidence passport generated
- Human declaration pending or completed

## 11. Stage 8 — Human Approval

An authorised accountant or business representative makes the final decision.

Permitted decisions can include:

- Approve a reconciliation recommendation
- Reject a candidate match
- Request additional evidence
- Mark a VAT amount as disallowed where permitted
- Select the applicable claim period
- Approve a credit/debit-note correction draft
- Authorise the final submission

The system should record who approved the action, when it was approved, what evidence was reviewed, and which version of the rule pack was applied.

## 12. Stage 9 — RAMIS Submission Boundary

The hackathon prototype must use a clearly labelled RAMIS simulator unless the team receives official IRD onboarding, credentials, endpoints and permission for a live integration.

```text
ComplyPilot
     ↓
RAMIS API / Portal Simulator
     ↓
GUI or API Agent prepares the submission
     ↓
Agent pauses for the human identity checkpoint
     ↓
Authorised human enters the demo OTP
     ↓
Simulator returns a demo acknowledgement
```

Required UI disclosure:

> **RAMIS simulator — no live government submission is performed.**

For future live integration, the backend adapter should authenticate using the official mechanism, keep credentials on the server, obtain and refresh the JWT, submit the approved schedule payload, prevent duplicate submissions, handle failures safely, and store the official response. Full live integration remains dependent on IRD onboarding and the private technical contract.

## 13. Stage 10 — Post-Submission Record

After a successful submission, the submitted period snapshot should be locked and preserved.

```text
Period: September 2026
Status: Submitted to simulator
Acknowledgement: CP-DEMO-2026-1042
Submitted by: Authorised user
```

The product should not silently modify the submitted snapshot. When a submitted Web API record contains an error, the correction assistant should prepare the appropriate credit/debit-note workflow and require human review.

## 14. Evidence Passport and Audit Trail

The final period package should include:

- Original document references and content hashes
- Extracted fields and confidence indicators
- Applied rules and official source references
- Reconciliation candidates and feature-level match explanations
- Detected mismatches and duplicate warnings
- Smart Fix drafts and human-supplied corrections
- Human decisions and timestamps
- Submission payload digest
- Simulator or official acknowledgement
- Rule-pack and application version

## 15. Recommended Product Navigation

Keep the interface centred on recurring work rather than a single large dashboard.

```text
Overview
Invoice Inbox
Reconciliation
Tasks
Period Close
Submissions
Business Settings
```

The main overview should prioritise four items:

1. Current VAT period and status
2. Next relevant due date
3. Records requiring human attention
4. VAT value affected by unresolved issues

## 16. Core Data Hierarchy

```text
Business Profile
└── VAT Filing Period
    ├── Source Documents
    ├── Extracted Invoice Records
    ├── Schedule Records
    ├── Reconciliation Candidates
    ├── AI Findings and Tasks
    ├── Human Decisions
    ├── Evidence Passport
    └── Submission Snapshot
```

Recommended period states:

```text
Not started
    ↓
Collecting records
    ↓
Needs evidence
    ↓
Ready for review
    ↓
Approved
    ↓
Submitted
    ↓
Correction required, if applicable
```

## 17. Hackathon Demo Story

The demo should show the lifecycle of one VAT period rather than imply that every business action happens in one session.

1. Open an existing business profile and the current VAT period.
2. Show invoices that were already collected earlier in the month.
3. Upload one new paper invoice and let Qwen extract it.
4. Show the dashboard updating automatically.
5. Resolve one Smart Fix that requires human evidence.
6. Reconcile a supplier-name variation with an explainable confidence score.
7. Block a VAT mismatch and prepare a credit-note recommendation.
8. Open Period Close and show the readiness gates.
9. Obtain explicit human approval.
10. Submit to the labelled RAMIS simulator and display the demo acknowledgement and audit trail.

## 18. Final Pitch

> **ComplyPilot is a continuous VAT operations workspace for Sri Lankan businesses. It collects records throughout each taxable period, uses explainable AI to identify and resolve compliance risks early, and prepares an evidence-backed RAMIS submission for final human approval.**
