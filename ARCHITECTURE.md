# ComplyPilot RefundShield — How This Thing Actually Works

**Purpose of this doc:** a plain-language walkthrough of the product, the architecture, and every moving part, so you (and your teammate) have one place to get oriented before demo day.

---

## 1. What problem this actually solves

Sri Lanka's VAT system is changing fast and in ways that create real financial risk for any VAT-registered business:

- A **new invoice format** becomes mandatory 1 October 2026 (Gazette 2481/22, amended by 2500/106).
- The old Simplified VAT scheme was replaced by a **Risk-Based Refund Scheme**, with a 45-day processing clock that can restart if IRD issues a "Notice 2" for missing/wrong schedules.
- IRD is rolling out **ERP-to-RAMIS Web API** integration — supplier data flows in, purchaser has to review and approve it, and once submitted it generally can't just be edited (you fix it with a credit/debit note instead).

Existing Sri Lankan tools (TaxSafe, Accounts.lk, etc.) already do invoicing and VAT calculation. **Nobody is doing the thing in between: turning messy, real-world evidence (a photographed invoice, a CSV schedule, an outdated supplier snapshot) into a defensible answer to "is this refund claim actually safe, and if not, what do I fix first, and how much money is that worth?"**

That's ComplyPilot. One sentence version:

> **It finds which input VAT is at risk, explains exactly why (with the rule and the gazette that says so), and shows a human the fastest way to protect that money before filing — with every number traceable back to a document.**

Everything in the architecture below exists in service of that one sentence.

---

## 2. The three big design decisions that shape everything else

These aren't implementation details — they're why the codebase looks the way it does.

1. **AI proposes, deterministic code decides, a human approves.** The readiness score, the money-at-risk figures, the rule that applies to an invoice — none of that comes from an LLM. It comes from plain TypeScript functions you could hand-check with a calculator. Qwen (Alibaba's AI model) is only used for reading messy documents, explaining decisions in plain English, and matching fuzzy text (like "ABC Trading" vs "ABC Trading Pvt Ltd"). If Qwen disagrees with the deterministic result, the deterministic result wins, always.
2. **Never claim to be the government.** No feature pretends to be the real IRD risk score, a live RAMIS connection, or an actual filed submission. Everything is labeled `DEMO FALLBACK` / `LIVE QWEN`, `LOCAL` / `LIVE MULERUN`, `Mock submission`, etc. — visibly, in the UI, all the time. This is a judging-criteria thing as much as an ethics thing: judges specifically probe "is this pretending to be something it isn't?"
3. **"Actual" and "what-if" are never the same number.** The real, persisted state of a case (what's actually resolved) and a hypothetical preview (what *would* happen if you fixed three specific things) are computed by completely separate code paths, so a preview can never accidentally become real by mistake, and the real state can never be silently overwritten by a simulation.

---

## 3. The architecture, top to bottom

```
                        ┌─────────────────────────────┐
                        │   Your browser (the UI)      │
                        │   Next.js React app          │
                        └───────────────┬───────────────┘
                                        │  HTTP (same app, same origin)
                        ┌───────────────▼───────────────┐
                        │   Next.js API routes           │
                        │   (this IS the backend —       │
                        │    no separate server)         │
                        └───┬───────────┬───────────┬────┘
                            │           │           │
                ┌───────────▼──┐  ┌─────▼─────┐ ┌───▼────────────┐
                │  PostgreSQL   │  │  Qwen /    │ │  MuleRun        │
                │  (run state,  │  │  Model     │ │  (workflow      │
                │  one table)   │  │  Studio    │ │  orchestration, │
                │               │  │  (Alibaba  │ │  optional)      │
                │  own Docker   │  │  Cloud AI) │ │                 │
                │  container    │  └───────────┘ └─────────────────┘
                └───────────────┘
```

**Key thing to understand: there is no separate backend server.** It's one Next.js application. The React pages you click around in and the `/api/*` routes that do the actual work (talk to Postgres, call Qwen, run the scoring engine) live in the *same* codebase and get built into the *same* Docker container. This was a deliberate choice in the plan — "reuse the existing Next.js architecture instead of adding FastAPI or another runtime" — because splitting it into two services would add real operational complexity (two deployments, two health checks, a network hop) for zero benefit at this scale.

### Frontend
- **Framework:** Next.js 15 (App Router) + React 19, TypeScript.
- **State:** plain React state in one root component (`app/page.tsx`) — no Redux/Zustand. All the different screens (Overview, Smart Fix Studio, Rules & Time Machine, Evidence, Mock Filing, Audit Trail) are components that just receive the current case data as a prop and call functions to trigger changes.
- **Styling:** one hand-written CSS file (`app/globals.css`), no Tailwind/component library — a small, deliberate design system (one accent color, a handful of reusable card/tag/pill classes).
- **No client-side scoring logic.** The frontend never calculates a score, a match, or a rule outcome itself — it only ever displays what the backend already computed. This matters for the "every number is reproducible" claim.

### Backend (the `/api/*` routes)
Each route is a small Next.js Route Handler. Here's what each one actually does:

| Route | What it does |
|---|---|
| `/api/analyze` | The main pipeline. Takes an uploaded invoice image or VAT Schedule CSV (or neither, for the demo case), runs the full 7-agent pipeline (below), and returns the complete case result. |
| `/api/resolve` | Toggles one finding between open/resolved and re-runs the deterministic checks — no new AI call. |
| `/api/simulate` | **Read-only preview.** Given a set of hypothetically-resolved findings, returns what the score *would* be — without saving anything. This is what powers the Refund Rescue Simulator's live "what-if" numbers. |
| `/api/chat` | The Data Copilot — answers questions grounded only in the current case + bundled official sources. |
| `/api/regulatory-watch` | Simulates detecting a change in an IRD source, and requires a named human reviewer to approve it before any rule changes. |
| `/api/file` | Drives the GUI filing agent (a real headless browser) against the bundled **mock** portal only. |
| `/api/approve` | The final human-approval step that produces a mock filing receipt. |
| `/api/government-data` | Serves the bundled reference data (VAT rates, gazette list, schedule definitions) to the UI. |

### Database — PostgreSQL
This was added recently and is worth understanding because it fixes a real bug that existed before: the app used to keep every user's session in an in-memory JavaScript `Map`, which meant **restarting the server wiped every active demo**, and there was no real boundary stopping one browser session from reading another's data.

Now:
- **One table, `runs`**: `run_id` (primary key), `owner_session_id`, `payload` (the whole case result, as JSON), timestamps.
- Every browser gets an **httpOnly session cookie** (`cp_demo_session`) the first time it hits the API. Every read/write to `runs` is scoped to that cookie's session ID — you physically cannot fetch someone else's run even if you guess their run ID.
- It survives a container restart. It's genuinely durable, not a demo trick.
- We deliberately did **not** normalize this into 10 relational tables — one JSON-blob table matches the app's own principle that "the whole case is one object, one source of truth," and it's much less to get wrong in the time we had.

### External services
- **Alibaba Cloud Model Studio (Qwen)** — three different jobs, three different models:
  - `qwen-vl-plus` (vision-language) reads the invoice photo and returns structured fields with confidence scores.
  - `qwen-plus` explains things in plain English (chat answers, the rescue plan's narrative) — it never invents the underlying facts, only phrases the deterministic ones.
  - `qwen3.7-text-embedding` does fuzzy supplier-name matching for reconciliation ("ABC Trading" ≈ "ABC Trading Pvt Ltd").
  - **If no API key is configured (or a call fails), the app doesn't break** — it falls back to a deterministic/fixture path and *says so visibly* in the UI (`DEMO FALLBACK`). This is why running it locally without any secrets still works.
- **MuleRun** — an optional external workflow engine. When configured (`WORKFLOW_MODE=mulerun`), the extracted case gets posted to a published MuleRun workflow that reports back against the *same seven agent names* the local orchestrator uses, so the two can be compared side by side. If MuleRun fails or isn't configured, the local orchestrator is authoritative anyway — MuleRun's opinion is advisory, never able to override the real score. This is real, working code — it just needs live credentials set before the actual demo.
- **Playwright (headless Chromium)** — powers the GUI filing agent, which drives a **mock** government portal bundled inside this same app (`/mock-portal`), never anything external.

---

## 4. Docker — what's actually in the container(s)

Two containers, defined in `docker-compose.yml`, isolated from anything else on the machine:

```
┌─────────────────────────────┐        ┌──────────────────────────────┐
│  complypilot-app             │        │  complypilot-db                │
│  (built from Dockerfile)     │───────▶│  postgres:16-alpine             │
│                              │  internal│                                │
│  - Next.js standalone build │  network │  - one volume:                  │
│  - Playwright/Chromium      │        │    complypilot-db-data           │
│  - published on :3000       │        │  - published on :5433 (not the   │
│    (host port configurable) │        │    Postgres default 5432, so it  │
│                              │        │    never collides with another   │
│                              │        │    project's Postgres)           │
└─────────────────────────────┘        └──────────────────────────────┘
```

- The **app image** is a multi-stage build: install deps → `next build` → copy the standalone output onto Microsoft's official Playwright base image (needed because the GUI filing agent needs a real Chromium binary + all its OS-level dependencies, which is a pain to install manually).
- The **database** never has its port exposed to the outside world in a way that matters for security — publishing on 5433 instead of 5432 is purely to avoid port collisions with *other* unrelated Postgres containers that might be running on the same laptop (this came up literally because your machine already had an unrelated `codimite-postgres` project on it).
- `docker compose up --build` builds and starts both. `docker compose up -d db` starts *just* the database, which is the fast path for local development (`npm run dev` against that + hot reload), used throughout this session's testing.
- Nothing here is secret-baked-into-the-image — API keys are passed as environment variables at container *run* time, read from a `.env` file that's git-ignored.

---

## 5. The seven-agent pipeline — the actual core product logic

Every single analysis run is described as passing through **seven declared stages**, always in this order, whether or not a given run actually needed a given stage. This matters because the UI can show "this run never reached stage 5, and here's exactly why" instead of just silently skipping it — a judge (or you) can audit exactly what happened.

| # | Agent | What decides here | What it actually does |
|---|---|---|---|
| 1 | **Qwen Document Agent** | AI (Qwen vision model) | Reads the invoice photo/PDF, returns every field (supplier TIN, invoice number, totals, dates...) with a per-field confidence score and a note on where it came from. |
| 2 | **Temporal Regulation Agent** | Deterministic code | Looks at the invoice's *own* date and picks the correct rule pack — the pre-October-2026 rules or the revised v2026.10 rules — and cites the exact Gazette that says so. This is the "was this format legally required on this date" logic. |
| 3 | **Smart Fix Agent** | Deterministic code | Compares the extraction against the active rule pack's required fields. For safe, format-only fixes (e.g. adding a missing "TAX INVOICE" title, forcing currency to LKR) it drafts the correction itself. For anything that's a *source fact* (a TIN, an address) it never invents a value — it flags it for a human. |
| 4 | **Semantic Reconciliation Agent** | Qwen explains, deterministic code decides | Matches the invoice against an uploaded VAT Schedule CSV row using five weighted, explainable checks (supplier TIN exact match 40%, invoice-number similarity 25%, amount tolerance 15%, date proximity 10%, supplier-name similarity 10%). Qwen's embedding model only helps decide *which* name is the closest fuzzy match when it's ambiguous — the score itself is arithmetic, not a language model's opinion. |
| 5 | **Refund Rescue Planning Agent** | Qwen explains, deterministic code decides | Ranks the open blockers by how much VAT money each one unlocks, and computes the deterministic "what if all of this were fixed" number. Qwen only writes the one-paragraph plain-English summary of that plan — never the numbers themselves. |
| 6 | **Human Approval Agent** | Human, always | The run stops here until an actual named person approves it. No code path skips this. |
| 7 | **Evidence Passport / Mock submission** | Deterministic code | Seals everything into an exportable, hash-verified evidence package, or (if the human chooses) runs the mock filing demo. Never touches a real government system. |

Everything the UI shows — the score, the confidence badges, the reconciliation table, the rescue plan — is just a rendering of the output of these seven stages. There's no hidden second calculation anywhere.

---

## 6. What you can actually click on — the features

### Smart Fix Studio *(built this session)*
Side-by-side: the invoice exactly as extracted vs. an AI-drafted corrected version, field by field, with the differences highlighted. Every flagged field shows *why* it's required (the rule ID, the effective date, a clickable link to the actual Gazette PDF). A human has to explicitly click "Approve corrected draft" — nothing here is ever silently applied.

### Refund Rescue Simulator *(built this session)*
This is the headline feature. A checklist of the specific things currently blocking the refund (e.g. "confirm supplier VAT status", "explain the Customs variance"). Tick a few, and you get a **live preview** — "Actual: 68/100, LKR 4.2M at risk" → "Selected what-if: 89/100, LKR 0 at risk" — computed by the *real* scoring engine, recalculated instantly, without touching the real case. Only clicking the separate "Apply selected corrections" button actually commits the change for real. This distinction (preview vs. apply) used to not exist — the old "Fix All" button was mislabeled as a "what-if" but was actually a real, permanent mutation every time you clicked it.

### VAT Schedule Reconciliation
Upload a CSV, get back matched / needs-review / mismatch / unmatched rows, with the exact score breakdown per feature (not just "80% match," but "TIN matched (+40), invoice number 82% similar (+20), amount within tolerance (+15)...").

### Regulatory Watch
Simulates the process of IRD publishing a rule change — shows the diff, requires a named tax reviewer to approve it before it becomes active. A detected change can never silently become law on its own.

### Data Copilot
A chat panel grounded only in the current case's actual data plus the bundled official sources — it explicitly refuses to invent a fact it doesn't have evidence for, and always cites which Gazette/notice it's drawing from.

### Mock Filing + GUI Agent
A real headless-browser AI agent that fills in a form the way a person would (reads the screen, decides the next click) — but it only ever drives a portal that's part of *this same app*, never anything external, and it hard-stops for a human to type in the OTP.

### Evidence Passport
An exportable, SHA-256-hashed JSON bundle of the entire case — findings, sources, approvals, audit trail — so the whole decision is traceable after the fact. (Explicitly labeled "tamper-evident," not "immutable" or "legally binding," since it's not append-only storage.)

---

## 7. Security/reliability things worth knowing about

These came out of an audit earlier in the build and are now fixed:

- **Session isolation** — every request is scoped to an httpOnly cookie; you cannot read or drive another browser's run/filing session by guessing an ID.
- **Rate limits** on the two endpoints that cost real money or resources (`/api/analyze` hits Qwen; `/api/file` launches a real Chromium process) — a public URL can't be used to burn your AI quota or crash the server with unlimited browser launches.
- **A hard cap on concurrent Chromium processes** in the GUI agent (each one is ~300MB+ of RAM) so a burst of requests can't take the whole box down.
- **Input validation everywhere client data crosses into the backend** (Zod schemas) — a malformed request gets a proper 400 error instead of crashing into a generic 500.
- **No raw internal error messages ever reach the client** — only a small allowlist of deliberately-written, safe messages.

---

## 8. The honest labeling system (why you'll see badges everywhere)

| You'll see... | It means... |
|---|---|
| `LIVE QWEN` vs `DEMO FALLBACK` | Whether Model Studio actually answered this run, or a deterministic fixture/fallback was used because no key was set or the call failed. |
| `LIVE MULERUN` vs `LOCAL` / `LOCAL FALLBACK` | Whether the remote MuleRun workflow actually ran, vs the local orchestrator (which is always the authoritative source of the real score regardless). |
| "ComplyPilot Refund Readiness" (never "IRD risk score") | The score is our own published, versioned formula — never a claim to know or reproduce the government's actual private methodology. |
| "Mock submission" / "Simulated RAMIS feed" | Nothing here ever touches a real government system. |
| "Draft corrected invoice" (never "corrected invoice") | Smart Fix's output is a proposal a human must approve — it's never presented as already legally valid. |

This labeling discipline is a judging-criteria requirement, not just good practice — PLAN.md is explicit that claiming any of these falsely is disqualifying.

---

## 9. Quick reference: tech stack

| Layer | Choice |
|---|---|
| Framework | Next.js 15 (App Router), React 19, TypeScript |
| Styling | Hand-written CSS, no framework |
| Database | PostgreSQL 16 (one JSONB table for run state) |
| Validation | Zod (every API boundary) |
| AI | Alibaba Cloud Model Studio — Qwen-VL-Plus (vision), Qwen-Plus (chat/narrative), Qwen3.7-text-embedding (fuzzy matching) |
| Workflow orchestration | MuleRun (optional; local deterministic orchestrator is always authoritative) |
| Browser automation | Playwright (Chromium) for the mock-portal filing agent |
| Testing | Vitest (42 tests currently: scoring rules, legal rule dates, rate limiting, pipeline shape) |
| Hosting target | Alibaba Cloud ECS, via Docker Compose |

---

## 10. If someone asks "why isn't this just a chatbot with a spreadsheet"

Because a chatbot can't guarantee its arithmetic is right, can't tell you which specific Gazette made a field mandatory on a specific date, and can't promise that yesterday's answer and today's answer for the same invoice are computed the same way. This product's entire value proposition is that **every number is small, boring, deterministic TypeScript** — reproducible by hand — with AI doing exactly the two things AI is actually good at: reading messy real-world documents, and explaining a decision in plain language. That combination is the pitch.
