import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { AUTH_SESSION_MAX_AGE, createAuthSession, registerUser } from "@/lib/auth/auth-store";
import { AUTH_COOKIE, SESSION_COOKIE } from "@/lib/http/session";
import { getOrCreateWorkspace, saveWorkspace } from "@/lib/workspace/workspace-store";

export const runtime = "nodejs";

const RequestSchema = z.object({
  fullName: z.string().trim().min(2).max(100),
  email: z.string().trim().email().max(160),
  phone: z.string().trim().min(7).max(30),
  role: z.enum(["OWNER", "ACCOUNTANT", "FINANCE", "TAX_AGENT"]),
  password: z.string().min(8).max(128),
});

export async function POST(request: Request) {
  try {
    const parsed = RequestSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Enter a valid name, email, phone, role and password of at least 8 characters." }, { status: 400 });
    const user = await registerUser(parsed.data);
    const jar = await cookies();
    const guestSessionId = jar.get(SESSION_COOKIE)?.value;
    if (guestSessionId) {
      const guestWorkspace = await getOrCreateWorkspace(guestSessionId);
      await saveWorkspace(`USER-${user.id}`, { ...guestWorkspace, updatedAt: new Date().toISOString() });
    }
    const token = await createAuthSession(user.id);
    const response = NextResponse.json({ user }, { status: 201 });
    response.cookies.set(AUTH_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: AUTH_SESSION_MAX_AGE });
    return response;
  } catch (error) {
    if (error instanceof Error && error.message === "EMAIL_EXISTS") return NextResponse.json({ error: "An account already exists for this email." }, { status: 409 });
    console.error("Account registration failed", error);
    return NextResponse.json({ error: "The account could not be created." }, { status: 500 });
  }
}
