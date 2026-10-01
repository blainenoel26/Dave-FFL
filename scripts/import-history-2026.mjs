// Loads 2026 weeks 1–3, which were run on the league spreadsheet, into the app: each owner's total,
// place and payout exactly as recorded and paid, plus every owner's weekly fee. Pick-level lineups
// aren't imported. Safe to re-run.
//
//   node --env-file=.env.local scripts/import-history-2026.mjs
import { createClient } from "@supabase/supabase-js";

const SEASON = 2026;
const ENTRY_FEE_CENTS = 1000;

// Totals and payouts from the league sheet (owners anonymized; mapping lives in private/).
const WEEKS = {
  1: {
    points: {
      owner01: 97, owner02: 87, owner03: 98, owner04: 0, owner05: 73, owner06: 103,
      owner07: 30, owner08: 107, owner09: 88, owner10: 102, owner11: 134, owner12: 91,
    },
    payouts: { owner11: 4000, owner08: 2800, owner06: 2200, owner10: 1700, owner03: 1300 },
  },
  2: {
    points: {
      owner01: 116, owner02: 80, owner03: 105, owner04: 86, owner05: 116, owner06: 111,
      owner07: 103, owner08: 118, owner09: 136, owner10: 138, owner11: 66, owner12: 75,
    },
    payouts: { owner10: 4000, owner09: 2800, owner08: 2200, owner01: 1500, owner05: 1500 },
  },
  3: {
    points: {
      owner01: 103, owner02: 105, owner03: 116, owner04: 108, owner05: 111, owner06: 116,
      owner07: 74, owner08: 116, owner09: 118, owner10: 101, owner11: 116, owner12: 99,
    },
    payouts: { owner09: 4000, owner03: 2000, owner06: 2000, owner08: 2000, owner11: 2000 },
  },
};

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false },
});
const must = (label, { data, error }) => {
  if (error) throw new Error(`${label}: ${error.message}`);
  return data;
};

const season = must("seasons", await db.from("seasons").select("id").eq("year", SEASON).single());
const owners = must("owners", await db.from("owners").select("id, owner_code"));
const ownerId = new Map(owners.map((o) => [o.owner_code, o.id]));
const weeks = must(
  "weeks",
  await db.from("weeks").select("id, number").eq("season_id", season.id).eq("kind", "regular").in("number", [1, 2, 3]),
);

for (const week of weeks) {
  const { points, payouts } = WEEKS[week.number];
  const totalPaid = Object.values(payouts).reduce((a, b) => a + b, 0);
  if (totalPaid !== Object.keys(points).length * ENTRY_FEE_CENTS) {
    throw new Error(`week ${week.number}: payouts ${totalPaid} don't equal the pot`);
  }

  const results = Object.entries(points).map(([code, pts]) => ({
    week_id: week.id,
    owner_id: ownerId.get(code),
    points: pts,
    place: 1 + Object.values(points).filter((p) => p > pts).length,
    payout_cents: payouts[code] ?? 0,
  }));
  const ledger = [
    ...results.map((r) => ({
      season_id: season.id,
      owner_id: r.owner_id,
      week_id: week.id,
      kind: "fee",
      cents: -ENTRY_FEE_CENTS,
      note: `Week ${week.number} entry`,
    })),
    ...results
      .filter((r) => r.payout_cents > 0)
      .map((r) => ({
        season_id: season.id,
        owner_id: r.owner_id,
        week_id: week.id,
        kind: "winnings",
        cents: r.payout_cents,
        note: `Week ${week.number}, place ${r.place} (league sheet)`,
      })),
  ];

  must("week_results", await db.from("week_results").delete().eq("week_id", week.id));
  must("week_results", await db.from("week_results").insert(results));
  must("ledger_entries", await db.from("ledger_entries").delete().eq("week_id", week.id).in("kind", ["fee", "winnings"]));
  must("ledger_entries", await db.from("ledger_entries").insert(ledger));
  must(
    "weeks",
    await db.from("weeks").update({ status: "closed", finalized_at: new Date().toISOString() }).eq("id", week.id),
  );
  console.log(`week ${week.number}: ${results.length} results, ${ledger.length} ledger entries`);
}

await db.from("audit_log").insert({ action: "import_history", detail: { season: SEASON, weeks: [1, 2, 3] } });
console.log("history import complete");
