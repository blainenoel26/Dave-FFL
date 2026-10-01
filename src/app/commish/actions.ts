"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { SaveResult } from "@/app/picks/actions";
import { validateLineup, type LineupPick, type Position, type Slot } from "@/lib/league/lineup";
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

/**
 * Replaces an owner's lineup for a week, ignoring kickoff locks (for fixing mistakes). Positions and
 * the one-x2 rule still apply. Logged to the audit trail; a finalized week is recalculated.
 */
export async function commishSaveLineup(
  ownerId: string,
  weekId: number,
  picks: Partial<Record<Slot, string>>,
  doubledSlot: Slot | null,
): Promise<SaveResult> {
  const owner = await getCurrentOwner();
  if (owner?.role !== "commissioner") return { ok: false, error: "Commissioner only" };

  const admin = createAdminClient();
  const { data: week } = await admin.from("weeks").select("number, status").eq("id", weekId).single();
  if (!week) return { ok: false, error: "Unknown week" };
  if (week.status === "closed") return { ok: false, error: "This week is closed." };

  const ids = Object.values(picks).filter((id): id is string => Boolean(id));
  const { data: players } = await admin.from("nfl_players").select("id, position").in("id", ids);
  const positionOf = new Map((players ?? []).map((p) => [p.id, p.position as Position]));
  const lineup: LineupPick[] = Object.entries(picks)
    .filter((entry): entry is [Slot, string] => Boolean(entry[1]))
    .map(([slot, playerId]) => ({
      slot,
      playerId,
      position: positionOf.get(playerId) ?? "QB",
      doubled: slot === doubledSlot,
    }));
  if (lineup.some((p) => !positionOf.has(p.playerId))) return { ok: false, error: "Unknown player in lineup" };
  if (doubledSlot && !picks[doubledSlot]) return { ok: false, error: "The x2 slot is empty" };
  const errors = validateLineup(lineup);
  if (errors.length) return { ok: false, error: errors.join("; ") };

  const { data: row, error: lineupError } = await admin
    .from("lineups")
    .upsert({ week_id: weekId, owner_id: ownerId }, { onConflict: "week_id,owner_id" })
    .select("id, lineup_picks(slot, player_id, is_doubled)")
    .single();
  if (lineupError) return { ok: false, error: lineupError.message };

  const { error: deleteError } = await admin.from("lineup_picks").delete().eq("lineup_id", row.id);
  if (deleteError) return { ok: false, error: deleteError.message };
  if (lineup.length) {
    const { error: insertError } = await admin.from("lineup_picks").insert(
      lineup.map((p) => ({ lineup_id: row.id, slot: p.slot, player_id: p.playerId, is_doubled: !!p.doubled })),
    );
    if (insertError) return { ok: false, error: insertError.message };
  }

  await admin.from("audit_log").insert({
    actor_id: owner.id,
    action: "fix_lineup",
    detail: { week: week.number, ownerId, before: row.lineup_picks, after: lineup },
  });
  if (week.status === "final") await finalizeWeek(admin, weekId, owner.id);

  revalidatePath("/lineups");
  revalidatePath("/money");
  return { ok: true };
}
