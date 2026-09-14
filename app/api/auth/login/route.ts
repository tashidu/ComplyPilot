import { NextResponse } from "next/server";
import { z } from "zod";
import { AUTH_SESSION_MAX_AGE, authenticateUser, createAuthSession } from "@/lib/auth/auth-store";
import { AUTH_COOKIE } from "@/lib/http/session";

export const runtime = "nodejs";
const RequestSchema = z.object({ email: z.string().trim().email().max(160), password: z.string().min(1).max(128) });

export async function POST(request: Request) {
  try {
    const parsed = RequestSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Enter a valid email and password." }, { status: 400 });
    const user = await authenticateUser(parsed.data.email, parsed.data.password);
    if (!user) return NextResponse.json({ error: "Email or password is incorrect." }, { status: 401 });
    const token = await createAuthSession(user.id);
    const response = NextResponse.json({ user });
    response.cookies.set(AUTH_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: AUTH_SESSION_MAX_AGE });
    return response;
  } catch (error) {
    console.error("Account login failed", error);
    return NextResponse.json({ error: "Login is temporarily unavailable." }, { status: 500 });
  }
}
