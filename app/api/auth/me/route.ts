import { getSession, withSession } from "@/lib/http/session";

export const runtime = "nodejs";

export async function GET() {
  const session = await getSession();
  return withSession({ user: session.user }, session);
}
