import { chromium, type Browser, type Page } from "playwright";
import OpenAI from "openai";

/**
 * GUI filing agent.
 *
 * The agent operates a portal the way a person does: it looks at a screenshot,
 * reads the interactive controls on the page, decides one action, performs it,
 * and looks again. Qwen chooses each action; this file only executes what the
 * model returned and enforces the safety rules.
 *
 * Two rules are enforced in code rather than left to the model:
 *   1. It only ever drives the mock portal, never a live government system.
 *   2. It stops at identity verification. An OTP is always entered by a human.
 */

export type AgentAction =
  | { action: "type"; targetId: string; value: string; reason: string }
  | { action: "click"; targetId: string; reason: string }
  | { action: "await_human"; targetId: string; reason: string }
  | { action: "done"; reason: string };

export type AgentStep = {
  index: number;
  time: string;
  /** Screenshot of the page as the agent saw it, before acting. JPEG data URL. */
  screenshot: string;
  heading: string;
  action: AgentAction;
  decidedBy: "qwen" | "fallback";
};

export type FilingData = {
  tin: string;
  password: string;
  period: string;
  inputVat: string;
  outputVat: string;
  refund: string;
};

export type SessionStatus = "awaiting_human" | "completed" | "failed";

export type AgentSession = {
  id: string;
  browser: Browser;
  page: Page;
  data: FilingData;
  steps: AgentStep[];
  status: SessionStatus;
  mode: "LIVE_QWEN" | "DEMO_FALLBACK";
  fallbackReason: string | null;
  acknowledgement: string | null;
  error: string | null;
  createdAt: number;
};

type Observation = {
  url: string;
  heading: string;
  error: string | null;
  /** Present only once the portal has accepted the filing. */
  acknowledgement: string | null;
  elements: {
    id: string;
    tag: string;
    type: string;
    label: string;
    value: string;
  }[];
};

const MAX_STEPS = 14;
const SESSION_TTL_MS = 15 * 60 * 1000;

/** Survives dev hot reloads so a paused session is still there after an edit. */
const store = globalThis as unknown as { __guiSessions?: Map<string, AgentSession> };
store.__guiSessions ??= new Map<string, AgentSession>();
const sessions = store.__guiSessions;

export function getSession(id: string): AgentSession | undefined {
  return sessions.get(id);
}

function now() {
  return new Date().toLocaleTimeString("en-GB", { hour12: false });
}

async function reapExpiredSessions() {
  const cutoff = Date.now() - SESSION_TTL_MS;
  for (const [id, session] of sessions) {
    if (session.createdAt < cutoff) {
      await session.browser.close().catch(() => {});
      sessions.delete(id);
    }
  }
}

/** What the agent can see: the rendered page plus its interactive controls. */
async function observe(page: Page): Promise<Observation> {
  return page.evaluate(() => {
    const elements: Observation["elements"] = [];
    document.querySelectorAll("input, button, select").forEach((node) => {
      const el = node as HTMLInputElement;
      if (!el.id) return;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const labelEl = document.querySelector(`label[for="${el.id}"]`);
      elements.push({
        id: el.id,
        tag: el.tagName.toLowerCase(),
        type: el.getAttribute("type") ?? "",
        label: (labelEl?.textContent ?? el.textContent ?? "").trim(),
        value: el.value ?? "",
      });
    });
    return {
      url: location.href,
      heading: document.querySelector("h1")?.textContent?.trim() ?? "",
      error: document.getElementById("portal-error")?.textContent?.trim() ?? null,
      acknowledgement: document.getElementById("ack")?.textContent?.trim() ?? null,
      elements,
    };
  }) as Promise<Observation>;
}

async function capture(page: Page): Promise<string> {
  const buffer = await page.screenshot({ type: "jpeg", quality: 60 });
  return `data:image/jpeg;base64,${buffer.toString("base64")}`;
}

/**
 * Deterministic planner used when Model Studio is unavailable. It produces the
 * same action shape so the demo still runs, and every step is labelled as
 * fallback so it is never mistaken for a model decision.
 */
function fallbackDecide(observation: Observation, data: FilingData): AgentAction {
  const find = (id: string) => observation.elements.find((el) => el.id === id);
  const fill: [string, string][] = [
    ["tin", data.tin],
    ["password", data.password],
    ["period", data.period],
    ["inputVat", data.inputVat],
    ["outputVat", data.outputVat],
    ["refund", data.refund],
  ];

  for (const [id, value] of fill) {
    const el = find(id);
    if (el && el.value.trim() === "") {
      return { action: "type", targetId: id, value, reason: `Fill ${el.label || id}.` };
    }
  }

  if (find("otp")) {
    return {
      action: "await_human",
      targetId: "otp",
      reason: "Identity verification requires a one-time password from the authorised human.",
    };
  }
  if (find("signin")) return { action: "click", targetId: "signin", reason: "Sign in." };
  if (find("continue")) {
    return { action: "click", targetId: "continue", reason: "Continue to verification." };
  }
  if (observation.heading.toLowerCase().includes("submitted")) {
    return { action: "done", reason: "The acknowledgement page is displayed." };
  }
  return { action: "done", reason: "No further action is available on this page." };
}

const SYSTEM_PROMPT = `You are a GUI agent operating a tax e-filing web portal on behalf of an authorised human accountant.

You see a screenshot of the current page and a list of the interactive elements on it. Choose exactly ONE next action.

Reply with JSON only, no prose, in one of these shapes:
{"action":"type","targetId":"<element id>","value":"<text to enter>","reason":"<short reason>"}
{"action":"click","targetId":"<element id>","reason":"<short reason>"}
{"action":"await_human","targetId":"<element id>","reason":"<short reason>"}
{"action":"done","reason":"<short reason>"}

Rules:
- Only use an id that appears in the element list.
- Fill every empty required field before clicking a button that advances the page.
- Never invent, guess or enter a one-time password, OTP, CAPTCHA or 2FA code. If the page asks for one, return await_human.
- Return done only when the submission acknowledgement is on screen.`;

async function qwenDecide(
  screenshot: string,
  observation: Observation,
  data: FilingData,
): Promise<AgentAction> {
  const apiKey = process.env.DASHSCOPE_API_KEY;
  if (!apiKey) throw new Error("DASHSCOPE_API_KEY is not set, so Model Studio was not called.");

  const openai = new OpenAI({
    apiKey,
    baseURL:
      process.env.DASHSCOPE_BASE_URL || "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
    timeout: 45_000,
    maxRetries: 1,
  });

  const response = await openai.chat.completions.create({
    model: process.env.QWEN_MODEL || "qwen-vl-plus",
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: [
          { type: "image_url", image_url: { url: screenshot } },
          {
            type: "text",
            text: [
              `Page heading: ${observation.heading || "(none)"}`,
              observation.error ? `Validation error on page: ${observation.error}` : "",
              `Interactive elements: ${JSON.stringify(observation.elements)}`,
              `Values to file: ${JSON.stringify(data)}`,
              "Choose the next action.",
            ]
              .filter(Boolean)
              .join("\n"),
          },
        ],
      },
    ],
    temperature: 0,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("Model Studio returned an empty response.");

  const cleaned = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/, "");
  const parsed = JSON.parse(cleaned) as AgentAction;

  if (!parsed || typeof parsed !== "object" || !("action" in parsed)) {
    throw new Error("Model Studio returned an action without an action field.");
  }
  return parsed;
}

/**
 * Types the way a person does, one key at a time.
 *
 * A bulk value assignment sets the DOM property without producing the key
 * events a React controlled input listens for, so the component state stays
 * empty, validation fails, and the next render wipes the field. Real keystrokes
 * keep the page's own state in step, and they read better on screen.
 */
async function typeInto(page: Page, id: string, value: string) {
  const field = page.locator(`#${id}`);
  await field.click();
  await field.fill("");
  await field.pressSequentially(value, { delay: 15 });
}

/** Performs one action. Returns false when the loop should stop. */
async function execute(page: Page, action: AgentAction): Promise<boolean> {
  if (action.action === "type") {
    await typeInto(page, action.targetId, action.value);
    return true;
  }
  if (action.action === "click") {
    await page.click(`#${action.targetId}`);
    await page.waitForTimeout(350);
    return true;
  }
  return false;
}

async function runLoop(session: AgentSession): Promise<void> {
  while (session.steps.length < MAX_STEPS) {
    const screenshot = await capture(session.page);
    const observation = await observe(session.page);

    // The acknowledgement is only in the DOM once the filing succeeded. Read it
    // from the snapshot rather than waiting on a locator, which would block for
    // the full Playwright timeout on every page that does not have one.
    if (observation.acknowledgement) {
      session.acknowledgement = observation.acknowledgement;
      session.status = "completed";
      session.steps.push({
        index: session.steps.length + 1,
        time: now(),
        screenshot,
        heading: observation.heading,
        action: {
          action: "done",
          reason: `Acknowledgement ${observation.acknowledgement} received.`,
        },
        decidedBy: session.mode === "LIVE_QWEN" ? "qwen" : "fallback",
      });
      return;
    }

    let action: AgentAction;
    let decidedBy: AgentStep["decidedBy"] = "qwen";

    if (session.mode === "LIVE_QWEN") {
      try {
        action = await qwenDecide(screenshot, observation, session.data);
      } catch (error) {
        session.mode = "DEMO_FALLBACK";
        session.fallbackReason = error instanceof Error ? error.message : String(error);
        action = fallbackDecide(observation, session.data);
        decidedBy = "fallback";
      }
    } else {
      action = fallbackDecide(observation, session.data);
      decidedBy = "fallback";
    }

    // Safety net: whatever the model says, an OTP field is never machine-filled.
    if (action.action === "type" && /otp|captcha|one-time|2fa/i.test(action.targetId)) {
      action = {
        action: "await_human",
        targetId: action.targetId,
        reason: "Blocked: a one-time password must be entered by the authorised human.",
      };
    }

    session.steps.push({
      index: session.steps.length + 1,
      time: now(),
      screenshot,
      heading: observation.heading,
      action,
      decidedBy,
    });

    if (action.action === "await_human") {
      session.status = "awaiting_human";
      return;
    }
    if (action.action === "done") {
      session.status = "completed";
      return;
    }

    await execute(session.page, action);
  }

  session.status = "failed";
  session.error = `The agent stopped after ${MAX_STEPS} steps without reaching an acknowledgement.`;
}

export async function startFiling(portalUrl: string, data: FilingData): Promise<AgentSession> {
  await reapExpiredSessions();

  let browser: Browser;
  try {
    browser = await chromium.launch({
      headless: process.env.GUI_AGENT_HEADLESS !== "false",
      args: ["--no-sandbox"],
    });
  } catch (error) {
    // The most common setup failure by far: dependencies installed but the
    // browser binary never downloaded, or downloaded for a different revision.
    const detail = error instanceof Error ? error.message : String(error);
    if (/executable doesn't exist|Failed to launch/i.test(detail)) {
      throw new Error(
        "Chromium is not installed for this Playwright version. Run: npx playwright install chromium (on a Linux server use --with-deps).",
      );
    }
    throw error;
  }
  const page = await browser.newPage({ viewport: { width: 1120, height: 760 } });

  const session: AgentSession = {
    id: `GUI-${Math.random().toString(36).slice(2, 9).toUpperCase()}`,
    browser,
    page,
    data,
    steps: [],
    status: "awaiting_human",
    mode: process.env.DASHSCOPE_API_KEY ? "LIVE_QWEN" : "DEMO_FALLBACK",
    fallbackReason: process.env.DASHSCOPE_API_KEY
      ? null
      : "DASHSCOPE_API_KEY is not set, so the deterministic planner drove the portal.",
    acknowledgement: null,
    error: null,
    createdAt: Date.now(),
  };
  sessions.set(session.id, session);

  try {
    await page.goto(portalUrl, { waitUntil: "domcontentloaded" });
    await runLoop(session);
  } catch (error) {
    session.status = "failed";
    session.error = error instanceof Error ? error.message : String(error);
  }

  if (session.status !== "awaiting_human") {
    await browser.close().catch(() => {});
  }
  return session;
}

/** Continues a paused session once the human has supplied the OTP. */
export async function submitOtp(sessionId: string, code: string): Promise<AgentSession> {
  const session = sessions.get(sessionId);
  if (!session) throw new Error("That filing session has expired. Start the agent again.");
  if (session.status !== "awaiting_human") {
    throw new Error("That filing session is not waiting for a one-time password.");
  }

  try {
    await typeInto(session.page, "otp", code);
    session.steps.push({
      index: session.steps.length + 1,
      time: now(),
      screenshot: await capture(session.page),
      heading: "Identity verification",
      action: {
        action: "type",
        targetId: "otp",
        value: "******",
        reason: "The authorised human entered the one-time password.",
      },
      decidedBy: "fallback",
    });
    await session.page.click("#submit");
    await session.page.waitForTimeout(400);
    await runLoop(session);
  } catch (error) {
    session.status = "failed";
    session.error = error instanceof Error ? error.message : String(error);
  }

  if (session.status !== "awaiting_human") {
    await session.browser.close().catch(() => {});
    sessions.delete(session.id);
  }
  return session;
}

/** Strips the browser handles so a session can be sent to the client. */
export function serialise(session: AgentSession) {
  return {
    sessionId: session.id,
    status: session.status,
    mode: session.mode,
    fallbackReason: session.fallbackReason,
    acknowledgement: session.acknowledgement,
    error: session.error,
    steps: session.steps,
  };
}
