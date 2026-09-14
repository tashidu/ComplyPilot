# ComplyPilot Three-Minute Demo Script

This script matches the exact UI and workflow we built for the Alibaba Cloud AI Buildathon submission. Follow this click-by-click to record a clean, 3-minute demonstration.

## Key Features Demonstrated
1. **Schema-Validated Document Extraction**: Invoice fields read by Alibaba Cloud Qwen-VL-Plus, validated with Zod and scored with per-field confidence before any rule runs.
2. **Interactive AI Chatbox (Data Copilot)**: A grounded assistant that answers questions based on the specific run's data and official tax references.
3. **GUI Filing Agent (mock portal)**: Human-approved submission driven by Playwright against a bundled mock portal, stopping at OTP for a human. It does not connect to RAMIS.
4. **Explainable AI Evidence Graph**: Visual tracing of how every document extraction maps to official tax rules.
5. **Regulatory Time Machine**: Deterministic testing of evidence against both historical and future Gazetted rule profiles.
6. **Pre-flight What-If Rescue**: Instant simulation of compliance score improvements when missing evidence is provided.

## Before recording

```bash
npm run dev          # Runs on http://localhost:3000
```

1. Open your browser at 100% zoom, window ~1440px wide. Hide bookmarks and other tabs.
2. Keep the terminal, `.env.local` and the API key off screen.
3. If you are using the Live Qwen extraction, ensure `DASHSCOPE_API_KEY` is in your `.env.local`. Have a sample invoice image ready on your desktop.
4. Click **Reset** in the top right. The score must read `68/100`, with unresolved blockers.
5. Record one clean take.

---

## UI shots the judges must see

| UI area | Why it matters |
| --- | --- |
| Top bar badges | Proves whether the demo is using `Live AI mode` or `Synthetic demo data`. |
| Readiness score ring | Establishes the measurable starting problem (Score: 68/100). |
| Priority blockers | Shows specific, actionable compliance issues (e.g., missing invoice fields). |
| Add evidence dropzone | Demonstrates how users ingest documents into the workflow. |
| Evidence graph | Shows explainable AI tracing from document → extraction → rule → human action. |
| Rules & time machine | Demonstrates dynamic, deterministic compliance based on Gazetted dates. |
| Mock filing workspace | Shows the final human-in-the-loop approval gate. |
| Audit trail | Proves end-to-end traceability for every AI and human action. |

Frame only the relevant card during each scene. Move the pointer slowly, pause on status changes for one second, and avoid rapid scrolling. 

---

## 0:00-0:30 — The Problem & Starting State

**Screen:** *Overview* (the default view).

**Do:** Let the score card fill the frame. Point out the score (`68/100`) and the priority blockers.

> "Sri Lankan businesses lose valuable time and input VAT because simple documentary errors or mismatched schedules are only discovered *after* filing. ComplyPilot RefundShield catches those errors before filing. It reads the documents with Qwen, checks them against the Gazetted rule that applied on the invoice date, and prepares a human-approved evidence package. Right now, our readiness score is 68 out of 100, and we have unresolved blockers requiring attention to protect our 45-day refund clock."

---

## 0:30-1:00 — Evidence & Live Extraction

**Do:**
1. Point to the top right badge to show if you are in **Live AI mode** or **Synthetic demo data**.
2. Scroll to the **Add evidence** card.
3. Drag and drop a sample invoice image into the dropzone (or click to upload).
4. Notice a new toast notification saying the file was added and analyzed.

> "ComplyPilot uses Alibaba Cloud's Qwen-VL-Plus model via Model Studio to accurately extract invoice fields from unstructured images. Instead of acting as a black box, it routes these extractions into a deterministic orchestrator that runs them against official tax rules."

---

## 1:00-1:20 — Ask the current case (Data Copilot)

**Do:**
1. Bottom right corner: click **Ask your data**.
2. In the chat panel, click the suggested question **Why is this case blocked?**
3. Wait for the answer to appear. Point at:
   - The mode badge (`LIVE QWEN` or `DEMO FALLBACK`)
   - One government-source chip (e.g., `GZ-2456-02`, `IRD-RBRS-CIRCULAR`)
4. Close the panel.

> "ComplyPilot's Data Copilot answers questions grounded in the current case: the readiness score, detected blockers, invoice extraction, VAT Schedule reconciliation and allow-listed government sources. Notice the mode label showing whether live Qwen or the deterministic fallback produced this answer."

**Keep visible:** the `68/100` readiness card behind the chat, the case-specific blockers list in the answer, and the government source chips proving the sources are allow-listed, not model-generated.

Do not ask an open-ended general tax question. The suggested question is designed to be short, case-specific, and auditable against the visible readiness card.

---

## 1:20-1:45 — Explainability (Evidence Graph)

**Do:**
1. Close the chat panel. Scroll down to the **Priority blockers** section.
2. Click **Evidence** on the first open blocker (e.g., Supplier evidence or Invoice compliance).
3. The view changes to the *Evidence graph*. Trace the nodes with your mouse.
4. Click **Back to overview** when done.

> "AI decisions must be explainable in finance. This evidence graph shows exactly why a case is blocked: it traces the source document, the specific Qwen-VL extraction result, the versioned rule that was applied, and the exact corrective human action required."

---

## 1:45-2:05 — Regulatory Time Machine

**Do:**
1. In the sidebar, click **Rules & time machine**.
2. Under "Choose the applicable rule profile", toggle between **Before 1 Oct 2026** and **Effective 1 Oct 2026**. 
3. Show how the decision panel changes (Action required vs Passed).

> "Tax rules change. Our Regulatory Time Machine lets a business see how the same evidence behaves under different Gazetted rules. When we switch to the October 2026 invoice profile, the system instantly recalculates our compliance gaps against official government sources."

Keep it short: just show the date toggle and one rule change. Skip the Notice 2 simulation to stay on time.

---

## 2:05-2:35 — What-If Rescue & Mock Filing

**Do:**
1. Click **Overview** in the sidebar.
2. Click the primary **Run what-if: fix all** button at the top. The score jumps to 89.
3. Click **Review filing** in the top right.
4. Check the "I reviewed the evidence packet..." authorization box.
5. Click **Submit to mock portal**. 
6. A success modal with a mock receipt appears. Close the modal.

> "To fix these issues, we can run a What-If scenario. Resolving the missing evidence bumps our readiness score from 68 to 89. The package is now approval-ready. In the filing workspace, an authorized human must explicitly review the package before submitting it to the mock portal, keeping humans firmly in the loop."

**Note:** The score is 89, not 100. The remaining 11 points require evidence the synthetic case does not contain—which is honest and more credible than a perfect 100.

---

## 2:35-3:00 — Audit Trail & Close

**Do:**
1. Click **Audit trail** in the sidebar.
2. Scroll through the timeline showing agent actions, human resolutions, and the filing event.
3. Optionally click **Export synthetic audit log** (a JSON file downloads).

> "Every action taken by Qwen, our deterministic agents, and the human reviewer is permanently logged in a verifiable audit trail. With ComplyPilot, any VAT-registered business gets fewer preventable errors, faster internal reviews, and a defensible evidence trail."

*End recording.*
