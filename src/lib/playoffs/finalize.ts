// After the Super Bowl: write every owner's playoff entry fee and the playoff winnings to the season
// ledger, then mark the Super Bowl round final. Safe to re-run.
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadPlayoffs } from "./data";

export async function finalizePlayoffs(
  admin: SupabaseClient,
): Promise<{ status: "finalized" } | { status: "skipped"; reason: string }> {
  const view = await loadPlayoffs(admin);
  if (!view) return { status: "skipped", reason: "no season" };
  const superBowl = view.rounds.find((r) => r.number === 4);
  if (!superBowl || !superBowl.games.length || superBowl.games.some((g) => g.state !== "post")) {
    return { status: "skipped", reason: "the Super Bowl isn't final yet" };
  }

  const { data: season } = await admin.from("seasons").select("playoff_entry_cents").eq("id", view.seasonId).single();
  const entry = season!.playoff_entry_cents as number;

  const rows = [
    ...view.standings.map((s) => ({
      season_id: view.seasonId,
      owner_id: s.ownerId,
      week_id: superBowl.id,
      kind: "fee",
      cents: -entry,
      note: "Playoff entry",
    })),
    ...view.standings
      .filter((s) => s.payoutCents > 0)
      .map((s) => ({
        season_id: view.seasonId,
        owner_id: s.ownerId,
        week_id: superBowl.id,
        kind: "winnings",
        cents: s.payoutCents,
        note: `Playoffs, place ${s.place}`,
      })),
  ];

  const del = await admin.from("ledger_entries").delete().eq("week_id", superBowl.id).in("kind", ["fee", "winnings"]);
  if (del.error) throw new Error(`ledger_entries: ${del.error.message}`);
  const ins = await admin.from("ledger_entries").insert(rows);
  if (ins.error) throw new Error(`ledger_entries: ${ins.error.message}`);

  await admin.from("weeks").update({ status: "final", finalized_at: new Date().toISOString() }).eq("id", superBowl.id);
  await admin.from("audit_log").insert({
    action: "finalize_playoffs",
    detail: { standings: view.standings.map((s) => ({ ownerId: s.ownerId, total: s.total, place: s.place, payout: s.payoutCents })) },
  });
  return { status: "finalized" };
}
