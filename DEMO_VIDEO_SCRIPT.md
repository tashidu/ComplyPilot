# ComplyPilot three-minute demo script

Click-by-click. Every label below is the exact text in the UI, and every number
was verified against a real run.

## Before recording

```bash
npm run dev          # http://localhost:3000
```

1. Browser at 100% zoom, window ~1440px wide. Hide bookmarks and other tabs.
2. Keep the terminal, `.env.local` and the API key off screen.
3. Click **Reset** in the top bar. The score must read `68`, with three blockers.
4. Have `public/demo/vat-schedule-demo.csv` on the desktop, or use the
   **Download demo CSV** link in the *Add evidence* card.
5. Check the two header badges and narrate what they actually say:
   - `AI: LIVE QWEN` or `AI: DEMO FALLBACK`
   - `Workflow: LIVE MULERUN` or `Workflow: LOCAL ORCHESTRATOR`
   Never call an amber badge live.
6. Do one rehearsal run so the GUI agent's Chromium is warm; the first launch is
   the slowest.
7. Record one clean take, and keep a backup recording of the filing segment in
   case the agent is slow on the day.

**Synthetic data only.** No real TIN, no real credentials, no live IRD portal.

---

## UI shots the judges must see

| UI area | Keep visible on screen | Why it matters |
| --- | --- | --- |
| Top bar | `AI: LIVE QWEN` or `AI: DEMO FALLBACK`, plus the actual Workflow badge | Proves the demo labels live and fallback paths honestly |
| Readiness card | Score, `LKR 4.2M`, unresolved-blocker count and rule-pack label | Establishes the measurable starting problem |
| Add evidence | Invoice/CSV dropzone and the resulting reconciliation status | Shows real evidence entering the workflow |
| Ask your data | One question, its answer, mode badge and government-source chips | Shows grounded conversational AI over the current run |
| Evidence graph | Source evidence → rule → validation → human action | Shows explainability rather than a black-box score |
| Rules & time machine | Date-profile toggle and at least one official source card | Shows date-aware compliance and source provenance |
| What-if result | New score, `Approval ready` and Refund Passport action | Shows measurable business impact |
| GUI filing agent | Agent screenshots, human OTP checkpoint and mock-portal warning | Provides the strongest agentic demo moment |
| Audit trail | AI action, human action and filing event | Proves end-to-end traceability |

Frame only the relevant card during each scene. Move the pointer slowly, pause on
status changes for one second, and avoid rapid scrolling. Do not show source code,
the terminal, browser developer tools or environment files.

---

## 0:00-0:18 — The problem

**Screen:** *Overview* (the default view).

**Do:** nothing. Let the score card fill the frame.

**Point at:** `68` out of 100 · `LKR 4.2M` claim value under review · `3` unresolved blockers.

> Sri Lankan exporters lose refund time because one invoice field, stale supplier
> evidence or a Customs mismatch is only discovered after filing. ComplyPilot
> finds those blockers before submission, and keeps every AI and human decision
> traceable.

---

## 0:18-0:42 — Extraction and deterministic reconciliation

**Do:**
1. Point at the two header badges, top right.
2. In *Add evidence*, click **Choose file** and upload the invoice image
   (only if `AI: LIVE QWEN` — otherwise skip and say so).
3. Upload `vat-schedule-demo.csv` the same way.

**Keep visible:** the *Add evidence* card, then the *Live VAT Schedule
reconciliation* status and totals.

**What appears depends on the evidence:**

- Live invoice plus a matching CSV: **Matched**, with matched-field chips.
- CSV without a live invoice extraction: **Invoice required**. The schedule
  finding is informational/inactive, the three actionable blockers remain, and
  the score stays at `68`.
- Extracted invoice with different values: **Review differences**, with each
  variance shown explicitly.

> Qwen reads the invoice image and returns schema-validated fields. The financial
> matching is deterministic: the schedule parser compares invoice number,
> supplier TIN and the three LKR values without letting a language model touch
> the figures.

If the schedule row says **Invoice required**, say exactly that:

> The schedule is parsed, but nothing is matched yet because no invoice has been
> extracted. The tool says so rather than claiming a match.

⚠️ Narrate the status actually shown. Never call **Invoice required** or **Review
differences** a match. Parsing evidence is not the same as reconciling it.

---

## 0:42-1:02 — Ask the current case

**Do:**
1. Click the bottom-right **Ask your data** button.
2. Click the suggested question **Why is this case blocked?**
3. Pause when the answer appears.
4. Point to the answer's `LIVE QWEN` or `DEMO FALLBACK` label.
5. Point to one government-source chip, then close the panel.

**Keep visible:** the `68/100` readiness card behind the chat panel, the answer
listing the current blockers, the answer-mode label and source chips such as
`GZ-2456-02` or `GZ-2481-22`.

> This is the Data Copilot. It answers from this analysis run — its score,
> findings, invoice extraction, schedule reconciliation and allow-listed
> government sources. The raw invoice image is not sent to chat, and every answer
> discloses whether live Qwen or the grounded fallback produced it.

Do not ask an open-ended general tax question in the video. The suggested
question produces a short, case-specific answer that judges can verify against
the visible readiness card.

---

## 1:02-1:20 — Evidence graph

**Do:**
1. On any blocker, click **Evidence**. (Or **Open evidence graph**.)
2. Let the chain render: source document → applied rule → required human action.
3. Optionally click another card under *Choose evidence chain*.
4. Click **Back to overview**.

> This is not an invoice generator. Every finding links the source evidence, the
> versioned rule that fired, and the corrective action, so a finance reviewer can
> see why the agent blocked the case.

---

## 1:20-1:40 — Rules and the time machine

**Do:**
1. Sidebar → **Rules & time machine**.
2. Click **Before 1 Oct 2026**, then **Effective 1 Oct 2026**. Watch the rule
   decision panel change.
3. Scroll just far enough to show *Government data layer* and one official source
   card. Show *Regulatory Watch Agent* only if time remains.
4. Optional: type a name in **Reviewing tax professional** and click **Approve
   rule pack** in a separate backup clip.

> The same invoice is tested against the rule that was in force on its
> transaction date. Sources carry their effective date and legal weight. When the
> watch agent detects a change, it cannot activate it: a named human tax
> professional has to approve the rule pack first.

Say **simulated** for the detection step. The approval gate is real — the server
rejects an approval with no reviewer name.

---

## 1:40-2:00 — What-if rescue plan

**Do:**
1. Sidebar → **Overview**.
2. Click **Run what-if: fix all**.
3. Point at the *Refund rescue plan* card.
4. Click **Export Refund Passport**.

**Expected:** `68` → `89`, claim value under review → `LKR 0`, status
**Approval ready**.

> Fixing the three evidence gaps moves readiness from 68 to 89. That number comes
> from published deterministic rules, not from a language model, so a reviewer can
> reproduce it by hand. The passport exports the case, its sources, findings and
> audit history with a SHA-256 digest.

⚠️ Narrate the number on screen. The fixture goes to `89`. It only exceeds that
if a live Qwen extraction genuinely matched a schedule row.

If you prefer the slower version, resolve the blockers one at a time instead:
`68 → 78 → 85 → 89`.

---

## 2:00-2:42 — GUI filing agent and the human checkpoint

**Do:**
1. Sidebar → **Mock filing**.
2. Tick the authorisation checkbox.
3. Scroll to *Agent filing run* and click **Let the agent file it**.
4. Wait for the step list with screenshots. It stops at step 9.
5. Type `482913` in the OTP box and click **Enter OTP and continue**.

**Expected:** nine steps, then a human checkpoint, then an acknowledgement like
`ACK-2026-419107`.

> Most compliance portals have no integration API, so the agent operates the
> portal the way a person does: it looks at the screen, reads the controls,
> chooses one action, and looks again. Every step keeps the screenshot it saw and
> the reason for the action. It stops at identity verification — OTP, CAPTCHA and
> two-factor fields always force a human hand-off, and that rule is enforced in
> code, not left to the model. This prototype never contacts the live IRD portal.

The mock portal carries a red **MOCK PORTAL — NOT THE IRD** banner. Let it be
visible; it answers the question a judge is about to ask.

---

## 2:42-3:00 — Audit trail and close

**Do:**
1. Sidebar → **Audit trail**.
2. Scroll through: extraction, rule decisions, human corrections, rule-pack
   approval, the agent's filing steps.
3. Optionally click **Export audit JSON**.

> One evidence-first workflow: Qwen for document understanding, MuleRun-ready
> orchestration, deterministic tax controls, and a human-approved GUI agent.
> Fewer preventable errors, faster review, and a complete audit trail.

End on the readiness card. Do not end on code or a terminal.

---

## If something goes wrong

| Problem | Do this |
| --- | --- |
| Agent filing 500s | Chromium is missing: `npx playwright install chromium`, then restart |
| Agent seems stuck | It is waiting for the OTP. Scroll down to the OTP box |
| Score is not 68 at the start | Click **Reset** in the top bar |
| Badge is amber | Say "demo fallback" or "local orchestrator". Do not call it live |
| Schedule says "Invoice required" | Correct behaviour with no invoice extracted. Say so and move on |
| Chat says "Demo fallback" | The API key/model was unavailable. Keep the badge visible and describe the grounded fallback honestly |
| Chat answer looks stale | Close it, change the case, then reopen it; the conversation resets when the run context changes |
| Numbers differ from this script | Read what is on screen. Never narrate a number the UI is not showing |

## Claims to avoid on camera

- Do not say MuleRun is orchestrating unless the badge reads `LIVE MULERUN`.
- Do not say Qwen read the invoice unless the badge reads `LIVE QWEN`.
- Do not call the readiness score an IRD risk rating.
- Do not promise a refund date or a payment guarantee.
- Do not describe the mock portal as the IRD portal.
- Do not describe a Data Copilot answer as legal or professional tax advice.
