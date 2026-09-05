import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { approved } = await req.json();

    if (!approved) {
      return NextResponse.json({ error: "Human approval is required for submission" }, { status: 400 });
    }

    const receiptNumber = `CP-DEMO-2026-${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`;

    const auditEvent = {
      time: new Date().toLocaleTimeString("en-GB", { hour12: false }),
      actor: "human",
      title: "Human-approved mock filing completed",
      detail: `Mock receipt ${receiptNumber} generated. No live government action occurred.`,
    };

    return NextResponse.json({ success: true, receiptNumber, auditEvent });
  } catch (error) {
    console.error("Error in /api/approve", error);
    return NextResponse.json(
      { error: "Failed to submit" },
      { status: 500 }
    );
  }
}
