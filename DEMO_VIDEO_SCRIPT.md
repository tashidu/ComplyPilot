# ComplyPilot three-minute demo script

## Before recording

1. Use synthetic data only. Never show a real taxpayer TIN, API key or IRD login.
2. Start the app and open `http://localhost:3000` at 100% browser zoom.
3. Keep the terminal and `.env` file outside the recording frame.
4. Click **Reset** so the opening score is `68/100` with three blockers.
5. Keep `public/demo/vat-schedule-demo.csv` ready for upload.
6. If live Qwen or MuleRun is not configured, say **demo fallback** or **local orchestrator**. Do not describe a fallback badge as live.
7. Record one clean take, but keep a backup screen recording in case the browser agent is slow.

## Timed walkthrough

### 0:00-0:20 — Problem and promise

**Screen:** Overview, showing `LKR 4.2M`, `68/100`, and the three blockers.

**Say:**

> Sri Lankan exporters can lose time in the VAT refund process because one invoice field, stale supplier evidence, or a Customs mismatch is discovered only after filing. ComplyPilot finds those blockers before submission and keeps every AI and human decision traceable.

### 0:20-0:50 — AI extraction and deterministic reconciliation

**Action:** Point to the AI and workflow badges. Upload a synthetic invoice image if live Qwen is configured. Upload `public/demo/vat-schedule-demo.csv`.

**Say:**

> Qwen reads the invoice image and returns schema-validated fields. Financial matching is deterministic: the VAT schedule parser compares invoice number, supplier TIN, net value, VAT and gross value without allowing an LLM to change the figures. The badges always disclose whether Qwen and MuleRun are live or whether the safe fallback is running.

If the schedule says **Invoice required**, explain that this is the correct result when no invoice has been extracted; do not claim a match.

### 0:50-1:15 — Evidence Graph

**Action:** Open the first blocker with **Evidence**, then show the source document, applied rule and required human action.

**Say:**

> This is more than an invoice generator. Every finding links the evidence, the versioned rule and the corrective action, so a finance reviewer can understand why the agent blocked the case.

Before leaving the Overview, open **Ask your data** and choose **Why is this case
blocked?** Point out that the answer uses the current run, links only allow-listed
official sources and labels live Qwen versus the deterministic fallback.

### 1:15-1:40 — Regulatory Time Machine

**Action:** Open **Rules & time machine**. Switch between the historical and `1 October 2026` profiles, then briefly show the Government Data Layer.

**Say:**

> The same invoice can be tested against the rule effective on its transaction date. Official-source metadata includes its effective date, verification status and legal weight. A detected regulatory change still needs named human approval before becoming an active rule pack.

### 1:40-2:00 — What-if rescue plan

**Action:** Return to **Overview** and click **Run what-if: fix all**. Show the new score and the approval-ready state. Click **Export Refund Passport**.

**Say:**

> The what-if action shows the value of fixing the evidence gaps. The score is recalculated by published deterministic rules, not by an LLM. The evidence passport exports the case, sources, findings and audit history with a SHA-256 tamper-evident digest.

The untouched fixture moves from `68` to `89`. A successfully matched uploaded
schedule adds three more points, so always narrate the number actually displayed
instead of promising a fixed final score.

### 2:00-2:40 — GUI filing agent and human checkpoint

**Action:** Open **Mock filing**, tick the authorisation checkbox, and click **Let the agent file it**. When it pauses, enter the demo OTP `482913` and continue.

**Say:**

> Many compliance portals have no integration API, so our GUI agent can operate the bundled mock portal. It observes, acts and records screenshots, but identity stays with the authorised person. OTP, CAPTCHA and two-factor fields always force a human hand-off. This prototype never contacts the live IRD portal.

### 2:40-3:00 — Audit, impact and close

**Action:** Open **Audit trail** and scroll through the extraction, rule, correction, approval and GUI-agent events.

**Say:**

> ComplyPilot turns a fragmented refund-preparation process into one evidence-first workflow: Qwen for document understanding, MuleRun-ready orchestration, deterministic tax controls, and a human-approved GUI agent. The result is fewer preventable errors, faster review and a complete audit trail.

End on the ComplyPilot logo and the readiness result. Do not spend the final seconds showing source code or terminal output.
