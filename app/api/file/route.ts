import { NextResponse } from "next/server";
import { serialise, startFiling, submitOtp, type FilingData } from "@/lib/agents/gui-agent";

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
  try {
    const body = await req.json().catch(() => ({}));

    // Continue a paused session with the human-supplied one-time password.
    if (body.sessionId && body.otp) {
      const session = await submitOtp(String(body.sessionId), String(body.otp));
      return NextResponse.json(serialise(session));
    }

    if (!body.approved) {
      return NextResponse.json(
        { error: "Human approval is required before the agent may operate the portal." },
        { status: 400 },
      );
    }

    // The agent only ever drives this application's own mock portal.
    const portalUrl = new URL("/mock-portal", req.url).toString();
    const session = await startFiling(portalUrl, { ...DEMO_CREDENTIALS, ...(body.data ?? {}) });
    return NextResponse.json(serialise(session));
  } catch (error) {
    console.error("Error in /api/file", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "The filing agent failed." },
      { status: 500 },
    );
  }
}
