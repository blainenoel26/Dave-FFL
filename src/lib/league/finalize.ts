// Finalizing a week: freeze each picked player's points, apply commissioner overrides, store the
// results and payouts, and write the week's fees and winnings to the ledger. Re-running it is
// safe and is how overrides take effect. See docs/LEAGUE-RULES.md → Weekly timeline.
import type { SupabaseClient } from "@supabase/supabase-js";
import { getWeekScores } from "../scoring/live";
import { RULES_2026 } from "../scoring/rules";
import type { Slot } from "./lineup";
import { payoutWeek } from "./payouts";

/** After this long past the week's last kickoff the week closes (Monday night → early Thursday). */
export const CLOSE_AFTER_MS = 54 * 60 * 60 * 1000;

export type FinalizeOutcome =
  | { status: "finalized"; warnings: string[] }
  | { status: "skipped"; reason: string };

interface WeekRow {
  id: number;
  number: number;
  status: string;
  season_id: number;
  seasons: { year: number; entry_fee_cents: number; payout_table_cents: number[] };
}

/** Points by player for a stored week, with the latest commissioner override winning. */
export async function getStoredPoints(db: SupabaseClient, weekId: number): Promise<Map<string, number>> {
  const [{ data: stats, error: statsError }, { data: overrides, error: overridesError }] = await Promise.all([
    db.from("player_week_stats").select("player_id, points").eq("week_id", weekId),
    db.from("stat_overrides").select("player_id, points").eq("week_id", weekId).order("created_at"),
  ]);
  if (statsError) throw new Error(`player_week_stats: ${statsError.message}`);
  if (overridesError) throw new Error(`stat_overrides: ${overridesError.message}`);

  const points = new Map<string, number>((stats ?? []).map((s) => [s.player_id, Number(s.points)]));
  for (const o of overrides ?? []) points.set(o.player_id, Number(o.points));
  return points;
}

export async function finalizeWeek(
  admin: SupabaseClient,
  weekId: number,
  actorId: string | null,
): Promise<FinalizeOutcome> {
  const { data: week, error: weekError } = await admin
    .from("weeks")
    .select("id, number, status, season_id, seasons(year, entry_fee_cents, payout_table_cents)")
    .eq("id", weekId)
    .single<WeekRow>();
  if (weekError) throw new Error(`weeks: ${weekError.message}`);
  if (week.status === "closed") return { status: "skipped", reason: "the week is closed" };

  const { data: lineups, error: lineupsError } = await admin
    .from("lineups")
    .select("owner_id, lineup_picks(slot, player_id, is_doubled)")
    .eq("week_id", weekId);
  if (lineupsError) throw new Error(`lineups: ${lineupsError.message}`);
  if (!lineups?.length) return { status: "skipped", reason: "no lineups were entered in the app" };

  const scores = await getWeekScores(week.seasons.year, week.number, RULES_2026);
  if (!scores.allFinal) return { status: "skipped", reason: "not every game is final yet" };

  // Freeze the points (and stat lines) of every picked player.
  type Pick = { slot: Slot; player_id: string; is_doubled: boolean };
  const picked = new Set(lineups.flatMap((l) => (l.lineup_picks as Pick[]).map((p) => p.player_id)));
  const statRows = [...picked].map((id) => ({
    week_id: weekId,
    player_id: id,
    points: scores.points.get(id) ?? 0,
    stats: scores.lines.get(id) ?? { didNotPlay: true },
    source: "espn",
    updated_at: new Date().toISOString(),
  }));
  const { error: statsError } = await admin.from("player_week_stats").upsert(statRows, { onConflict: "week_id,player_id" });
  if (statsError) throw new Error(`player_week_stats: ${statsError.message}`);

  const points = await getStoredPoints(admin, weekId);

  // Every owner in the season is in the standings; no lineup scores 0.
  const { data: members, error: membersError } = await admin
    .from("season_owners")
    .select("owner_id")
    .eq("season_id", week.season_id);
  if (membersError) throw new Error(`season_owners: ${membersError.message}`);

  const picksByOwner = new Map(lineups.map((l) => [l.owner_id as string, l.lineup_picks as Pick[]]));
  const totals = (members ?? []).map((m) => ({
    ownerId: m.owner_id as string,
    points: (picksByOwner.get(m.owner_id) ?? []).reduce(
      (sum, p) => sum + (points.get(p.player_id) ?? 0) * (p.is_doubled ? 2 : 1),
      0,
    ),
  }));
  const standings = payoutWeek(totals, week.seasons.payout_table_cents);

  const check = (table: string, error: { message: string } | null) => {
    if (error) throw new Error(`${table}: ${error.message}`);
  };

  check("week_results", (await admin.from("week_results").delete().eq("week_id", weekId)).error);
  check(
    "week_results",
    (
      await admin.from("week_results").insert(
        standings.map((s) => ({
          week_id: weekId,
          owner_id: s.ownerId,
          points: s.points,
          place: s.place,
          payout_cents: s.cents,
        })),
      )
    ).error,
  );

  check(
    "ledger_entries",
    (await admin.from("ledger_entries").delete().eq("week_id", weekId).in("kind", ["fee", "winnings"])).error,
  );
  check(
    "ledger_entries",
    (
      await admin.from("ledger_entries").insert([
        ...standings.map((s) => ({
          season_id: week.season_id,
          owner_id: s.ownerId,
          week_id: weekId,
          kind: "fee",
          cents: -week.seasons.entry_fee_cents,
          note: `Week ${week.number} entry`,
        })),
        ...standings
          .filter((s) => s.cents > 0)
          .map((s) => ({
            season_id: week.season_id,
            owner_id: s.ownerId,
            week_id: weekId,
            kind: "winnings",
            cents: s.cents,
            note: `Week ${week.number}, place ${s.place}`,
          })),
      ])
    ).error,
  );

  const { error: statusError } = await admin
    .from("weeks")
    .update({ status: "final", finalized_at: new Date().toISOString() })
    .eq("id", weekId);
  if (statusError) throw new Error(`weeks: ${statusError.message}`);

  await admin.from("audit_log").insert({
    actor_id: actorId,
    action: "finalize_week",
    detail: { week: week.number, warnings: scores.warnings },
  });

  return { status: "finalized", warnings: scores.warnings };
}
