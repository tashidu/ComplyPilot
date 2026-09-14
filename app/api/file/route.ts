import { NextResponse } from "next/server";
import {
  GuiAgentClientError,
  serialise,
  startFiling,
  submitOtp,
  type FilingData,
} from "@/lib/agents/gui-agent";
import { getOrCreateSessionId, withSessionCookie } from "@/lib/runs/session";

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

export async function POST(req: Request) {
  const { id: ownerSessionId, isNew } = await getOrCreateSessionId();
  try {
    const body = await req.json().catch(() => ({}));

    // Continue a paused session with the human-supplied one-time password.
    if (body.sessionId && body.otp) {
      const session = await submitOtp(String(body.sessionId), String(body.otp), ownerSessionId);
      return withSessionCookie(NextResponse.json(serialise(session)), ownerSessionId, isNew);
    }

    if (!body.approved) {
      return NextResponse.json(
        { error: "Human approval is required before the agent may operate the portal." },
        { status: 400 },
      );
    }

    // The agent only ever drives this application's own mock portal.
    const portalUrl = new URL("/mock-portal", req.url).toString();
    const session = await startFiling(
      portalUrl,
      { ...DEMO_CREDENTIALS, ...(body.data ?? {}) },
      ownerSessionId,
    );
    return withSessionCookie(NextResponse.json(serialise(session)), ownerSessionId, isNew);
  } catch (error) {
    console.error("Error in /api/file", error);
    // Only deliberately-written, safe agent errors are ever shown to the
    // client. Anything else (a raw Playwright/filesystem exception) stays
    // server-side, logged above.
    if (error instanceof GuiAgentClientError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "The filing agent failed. Try again shortly." }, { status: 500 });
  }
}
