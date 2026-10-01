"use server";

import { redirect } from "next/navigation";
import { sendWeekResults } from "@/lib/email/league";
import { emailConfigured, sendEmails, siteUrl } from "@/lib/email/send";
import { finalizeWeek } from "@/lib/league/finalize";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentOwner } from "@/lib/supabase/server";

async function requireCommissioner() {
  const owner = await getCurrentOwner();
  if (owner?.role !== "commissioner") throw new Error("Commissioner only");
  return owner;
}

function back(week: number, message: string): never {
  redirect(`/commish?week=${week}&msg=${encodeURIComponent(message)}`);
}

export async function finalizeAction(form: FormData) {
  const commissioner = await requireCommissioner();
  const weekId = Number(form.get("weekId"));
  const weekNumber = Number(form.get("weekNumber"));

  const admin = createAdminClient();
  const outcome = await finalizeWeek(admin, weekId, commissioner.id);
  if (outcome.status !== "finalized") back(weekNumber, `Not finalized: ${outcome.reason}.`);

  let emailNote = "";
  if (outcome.firstTime && emailConfigured()) {
    try {
      emailNote = ` Results emailed to ${await sendWeekResults(admin, weekId)} owners.`;
    } catch (e) {
      emailNote = ` The results email failed: ${(e as Error).message}`;
    }
  }
  back(weekNumber, `Week ${weekNumber} finalized. Results and payouts are saved.${emailNote}`);
}

export async function testEmailAction(form: FormData) {
  const commissioner = await requireCommissioner();
  const weekNumber = Number(form.get("weekNumber"));
  const { data: me } = await createAdminClient().from("owners").select("email").eq("id", commissioner.id).single();
  if (!me?.email) back(weekNumber, "Couldn't find your email on the roster.");

  let result: string;
  try {
    await sendEmails([
      {
        to: me.email,
        subject: "Dave FFL test email",
        text: `Hi ${commissioner.displayName},\n\nLeague email is working.\n\n${siteUrl()}\n\nDave FFL`,
      },
    ]);
    result = `Test email sent to ${me.email}. Check your inbox (and spam).`;
  } catch (e) {
    result = `Test email failed: ${(e as Error).message}`;
  }
  back(weekNumber, result);
}

export async function overrideAction(form: FormData) {
  const commissioner = await requireCommissioner();
  const weekId = Number(form.get("weekId"));
  const weekNumber = Number(form.get("weekNumber"));
  const playerId = String(form.get("playerId") ?? "");
  const points = Number(form.get("points"));
  const reason = String(form.get("reason") ?? "").trim();

  if (!playerId || !Number.isFinite(points) || !reason) {
    back(weekNumber, "Pick a player, enter the corrected points, and give a reason.");
  }

  const admin = createAdminClient();
  const { data: week } = await admin.from("weeks").select("status").eq("id", weekId).single();
  if (week?.status !== "final") {
    back(weekNumber, "Corrections are only allowed on a finalized week that isn't closed.");
  }

  const { error } = await admin
    .from("stat_overrides")
    .insert({ week_id: weekId, player_id: playerId, points, reason, author_id: commissioner.id });
  if (error) back(weekNumber, `Couldn't save the correction: ${error.message}`);

  await admin.from("audit_log").insert({
    actor_id: commissioner.id,
    action: "override_points",
    detail: { week: weekNumber, playerId, points, reason },
  });

  const outcome = await finalizeWeek(admin, weekId, commissioner.id);
  back(
    weekNumber,
    outcome.status === "finalized"
      ? "Correction saved. Results and payouts were recalculated."
      : `Correction saved, but results weren't recalculated: ${outcome.reason}.`,
  );
}
