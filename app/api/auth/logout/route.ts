import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { revokeAuthSession } from "@/lib/auth/auth-store";
import { AUTH_COOKIE } from "@/lib/http/session";

export const runtime = "nodejs";

export async function POST() {
  const jar = await cookies();
  const token = jar.get(AUTH_COOKIE)?.value;
  if (token) await revokeAuthSession(token).catch((error) => console.error("Logout session cleanup failed", error));
  const response = NextResponse.json({ ok: true });
  response.cookies.set(AUTH_COOKIE, "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
  return response;
}
