import { NextResponse, type NextRequest } from "next/server";
import { CLOSE_AFTER_MS, finalizeWeek } from "@/lib/league/finalize";
import { createAdminClient } from "@/lib/supabase/admin";

// Runs daily (vercel.json → crons). Finalizes weeks whose games are all final and closes weeks
// whose commissioner window has passed. Vercel sends "Authorization: Bearer $CRON_SECRET".
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: weeks, error } = await admin
    .from("weeks")
    .select("id, number, status, nfl_games(kickoff)")
    .eq("kind", "regular")
    .in("status", ["open", "provisional", "final"])
    .order("number");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const now = Date.now();
  const report: Record<string, string> = {};
  for (const week of weeks ?? []) {
    const kickoffs = (week.nfl_games as { kickoff: string }[]).map((g) => new Date(g.kickoff).getTime());
    if (!kickoffs.length) continue;
    const lastKickoff = Math.max(...kickoffs);
    if (lastKickoff > now) continue; // not over yet

    if (week.status === "final") {
      if (now - lastKickoff > CLOSE_AFTER_MS) {
        await admin.from("weeks").update({ status: "closed" }).eq("id", week.id);
        report[`week ${week.number}`] = "closed";
      }
      continue;
    }

    const outcome = await finalizeWeek(admin, week.id, null);
    report[`week ${week.number}`] = outcome.status === "finalized" ? "finalized" : `skipped: ${outcome.reason}`;
  }

  return NextResponse.json({ ok: true, report });
}
