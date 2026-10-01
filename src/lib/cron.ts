import { NextResponse, type NextRequest } from "next/server";

/** Vercel cron requests carry "Authorization: Bearer $CRON_SECRET". Returns an error response or null. */
export function rejectUnlessCron(request: NextRequest): NextResponse | null {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET is not configured on this deployment" }, { status: 500 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return null;
}
