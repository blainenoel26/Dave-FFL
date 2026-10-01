"use server";

import { redirect } from "next/navigation";
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

  const outcome = await finalizeWeek(createAdminClient(), weekId, commissioner.id);
  back(
    weekNumber,
    outcome.status === "finalized"
      ? `Week ${weekNumber} finalized. Results and payouts are saved.`
      : `Not finalized: ${outcome.reason}.`,
  );
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
