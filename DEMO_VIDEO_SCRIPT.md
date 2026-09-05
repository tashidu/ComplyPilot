# ComplyPilot Three-Minute Demo Script

This script matches the exact UI and workflow we built for the Alibaba Cloud AI Buildathon submission. Follow this click-by-click to record a clean, 3-minute demonstration.

## Key Features Demonstrated
1. **Zero-Error VAT Document Processing**: Automated extraction of invoice data using Alibaba Cloud Qwen-VL-Plus.
2. **Interactive AI Chatbox (Data Copilot)**: A grounded assistant that answers questions based on the specific run's data and official tax references.
3. **RAMIS GUI Filing Agent Integration**: Automated, human-approved submission of the final package via a mock portal.
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

> "Sri Lankan exporters often lose valuable time on their VAT refunds because simple documentary errors or customs mismatches are only discovered *after* filing. ComplyPilot RefundShield solves this by automatically processing VAT-related documents without errors. It features an interactive chatbox for instant data queries and integrates seamlessly with the IRD's RAMIS portal using an automated GUI filing agent. Right now, our readiness score is 68 out of 100, and we have unresolved blockers requiring attention to protect our 45-day refund clock."

---

## 0:30-1:00 — Evidence & Live Extraction

**Do:**
1. Point to the top right badge to show if you are in **Live AI mode** or **Synthetic demo data**.
2. Scroll to the **Add evidence** card.
3. Drag and drop a sample invoice image into the dropzone (or click to upload).
4. Notice a new toast notification saying the file was added and analyzed.

> "ComplyPilot uses Alibaba Cloud's Qwen-VL-Plus model via Model Studio to accurately extract invoice fields from unstructured images. Instead of acting as a black box, it routes these extractions into a deterministic orchestrator that runs them against official tax rules."

---

## 1:00-1:30 — Explainability (Evidence Graph)

**Do:**
1. Scroll down to the **Priority blockers** section.
2. Click **Evidence** on the first open blocker (e.g., Supplier evidence or Invoice compliance).
3. The view changes to the *Evidence graph*. Trace the nodes with your mouse.
4. Click **Back to overview** when done.

> "AI decisions must be explainable in finance. This evidence graph shows exactly why a case is blocked: it traces the source document, the specific Qwen-VL extraction result, the versioned rule that was applied, and the exact corrective human action required."

---

## 1:30-2:00 — Regulatory Time Machine

**Do:**
1. In the sidebar, click **Rules & time machine**.
2. Under "Choose the applicable rule profile", toggle between **Before 1 Oct 2026** and **Effective 1 Oct 2026**. 
3. Show how the decision panel changes (Action required vs Passed).
4. Scroll down to the **45-day clock twin** and click **Simulate Notice 2** to show the dates changing dynamically.

> "Tax rules change. Our Regulatory Time Machine lets exporters see how the exact same evidence behaves under different Gazetted rules. If we switch to the new October 2026 invoice profile, the system instantly recalculates our compliance gaps. We can also simulate real-world delays, like IRD Notice 2, to see the direct impact on our 45-day refund timeline."

---

## 2:00-2:25 — What-If Rescue & Mock Filing

**Do:**
1. Click **Overview** in the sidebar.
2. Click the primary **Run what-if: fix all** button at the top. The score jumps to 100.
3. Click **Review filing** in the top right.
4. Check the "I reviewed the evidence packet..." authorization box.
5. Click **Submit to mock portal**. 
6. A success modal with a mock receipt appears. Close the modal.

> "To fix these issues, we can run a What-If scenario. Resolving the missing evidence immediately bumps our readiness score to 100. The package is now approval-ready. In the filing workspace, an authorized human must explicitly review the package before submitting it to the mock portal, keeping humans firmly in the loop."

---

## 2:25-3:00 — Audit Trail & Close

**Do:**
1. Click **Audit trail** in the sidebar.
2. Slowly scroll through the timeline showing agent actions and human resolutions.
3. Point out the mock filing completion event.
4. Click **Export synthetic audit log** (a JSON file downloads).

> "Every action taken by Qwen, our deterministic agents, and the human reviewer is permanently logged in a verifiable audit trail. With ComplyPilot, exporters get fewer preventable errors, faster internal reviews, and absolute confidence in their 45-day VAT refund timeline."

*End recording.*
