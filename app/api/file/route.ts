import { NextResponse } from "next/server";
import {
  AgentBusyError,
  UnknownFilingSessionError,
  serialise,
  startFiling,
  submitOtp,
  type FilingData,
} from "@/lib/agents/gui-agent";
import { consumeRate, getSession, rateLimited, withSession } from "@/lib/http/session";

export const runtime = "nodejs";
export const maxDuration = 120;

const DEMO_CREDENTIALS: FilingData = {
  tin: "134857291-7000",
  password: "demo-portal-password",
  period: "October 2026",
  inputVat: "4200000.00",
  outputVat: "1850000.00",
  refund: "2350000.00",
};

// Each start launches a browser, so this ceiling is deliberately low.
const FILE_LIMIT = 8;
const FILE_WINDOW_MS = 10 * 60 * 1000;

export async function POST(req: Request) {
  const session = await getSession();
  try {
    const body = await req.json().catch(() => ({}));

    // Continue a paused session with the human-supplied one-time password.
    if (body.sessionId && body.otp) {
      const filing = await submitOtp(String(body.sessionId), String(body.otp), session.id);
      return withSession(serialise(filing), session);
    }

    const rate = consumeRate(`file:${session.id}`, FILE_LIMIT, FILE_WINDOW_MS);
    if (!rate.allowed) {
      return rateLimited(
        rate.retryAfterSeconds,
        "The filing agent has run several times for this session. Wait a moment and try again.",
      );
    }

    if (!body.approved) {
      return NextResponse.json(
        { error: "Human approval is required before the agent may operate the portal." },
        { status: 400 },
      );
    }

    // The agent only ever drives this application's own mock portal.
    const portalUrl = new URL("/mock-portal", req.url).toString();
    const filing = await startFiling(
      portalUrl,
      { ...DEMO_CREDENTIALS, ...(body.data ?? {}) },
      session.id,
    );
    return withSession(serialise(filing), session);
  } catch (error) {
    console.error("Error in /api/file", error);
    if (error instanceof UnknownFilingSessionError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof AgentBusyError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    // Setup problems are worth surfacing verbatim because they tell an operator
    // exactly what to install. Everything else stays generic: raw messages here
    // carry filesystem paths.
    const detail = error instanceof Error ? error.message : "";
    const isSetup = /playwright|chromium|executable/i.test(detail);
    return NextResponse.json(
      {
        error: isSetup
          ? detail
          : "The filing agent failed. The server log has the details.",
      },
      { status: 500 },
    );
  }
}
