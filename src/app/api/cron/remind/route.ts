import { NextResponse, type NextRequest } from "next/server";
import { rejectUnlessCron } from "@/lib/cron";
import { sendPickReminders } from "@/lib/email/league";
import { emailConfigured } from "@/lib/email/send";
import { getCurrentWeek } from "@/lib/league/week";
import { createAdminClient } from "@/lib/supabase/admin";

// Runs Thursday and Sunday at noon ET (vercel.json → crons): reminds owners whose lineup is missing
// picks or the x2, while games are still to come.
export async function GET(request: NextRequest) {
  const rejected = rejectUnlessCron(request);
  if (rejected) return rejected;
  if (!emailConfigured()) return NextResponse.json({ ok: true, report: "email not set up; nothing sent" });

  const admin = createAdminClient();
  const week = await getCurrentWeek(admin);
  if (!week) return NextResponse.json({ ok: true, report: "no current week" });

  const sent = await sendPickReminders(admin, week);
  return NextResponse.json({ ok: true, report: `${week.label}: ${sent} reminder(s) sent` });
}
