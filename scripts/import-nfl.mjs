// Imports NFL teams, fantasy-relevant players and the season schedule from ESPN into Supabase.
// Safe to re-run: everything is upserted.
//
//   node --env-file=.env.local scripts/import-nfl.mjs 2026            # write to Supabase
//   node scripts/import-nfl.mjs 2026 --dry-run                        # fetch and count only
//
// Writing needs SUPABASE_SECRET_KEY (server-only; never exposed to browsers).
import { createClient } from "@supabase/supabase-js";

const args = process.argv.slice(2);
const season = Number(args.find((a) => /^\d{4}$/.test(a)));
const dryRun = args.includes("--dry-run");
if (!season) throw new Error("usage: import-nfl.mjs <season> [--dry-run]");

const ESPN = "https://site.api.espn.com/apis/site/v2/sports/football/nfl";
const REGULAR_SEASON_WEEKS = 18;
// Playoff rounds and ESPN's postseason week numbers (ESPN week 4 is the Pro Bowl, skipped).
const PLAYOFF_ROUNDS = [
  { number: 1, espnWeek: 1, label: "Wild Card" },
  { number: 2, espnWeek: 2, label: "Divisional" },
  { number: 3, espnWeek: 3, label: "Conference Championships" },
  { number: 4, espnWeek: 5, label: "Super Bowl" },
];

const POSITIONS = { QB: "QB", RB: "RB", FB: "RB", WR: "WR", TE: "TE", PK: "K", K: "K" };
const GAME_STATUS = {
  STATUS_SCHEDULED: "scheduled",
  STATUS_FINAL: "final",
  STATUS_FINAL_OVERTIME: "final",
};

async function espn(path) {
  const res = await fetch(`${ESPN}${path}`);
  if (!res.ok) throw new Error(`ESPN ${res.status}: ${path}`);
  return res.json();
}

// ── Fetch ───────────────────────────────────────────────────────────────────
const teamList = (await espn("/teams")).sports[0].leagues[0].teams.map((t) => t.team);
const teams = teamList.map((t) => ({ id: t.abbreviation, name: t.displayName }));

const players = new Map();
for (const team of teamList) {
  const roster = await espn(`/teams/${team.id}/roster`);
  for (const group of roster.athletes ?? []) {
    for (const a of group.items) {
      const position = POSITIONS[a.position?.abbreviation];
      if (!position) continue;
      players.set(a.id, {
        id: a.id,
        full_name: a.displayName,
        position,
        team_id: team.abbreviation,
        active: true,
        updated_at: new Date().toISOString(),
      });
    }
  }
  players.set(`DEF-${team.abbreviation}`, {
    id: `DEF-${team.abbreviation}`,
    full_name: `${team.shortDisplayName} D/ST`,
    position: "DEF",
    team_id: team.abbreviation,
    active: true,
    updated_at: new Date().toISOString(),
  });
}

const weekDefs = [
  ...Array.from({ length: REGULAR_SEASON_WEEKS }, (_, i) => ({
    kind: "regular", number: i + 1, label: `Week ${i + 1}`, espnType: 2, espnWeek: i + 1,
  })),
  ...PLAYOFF_ROUNDS.map((r) => ({ kind: "playoff", number: r.number, label: r.label, espnType: 3, espnWeek: r.espnWeek })),
];
const teamIds = new Set(teams.map((t) => t.id));

const schedule = [];
let pendingPlayoffGames = 0;
for (const def of weekDefs) {
  const board = await espn(`/scoreboard?seasontype=${def.espnType}&week=${def.espnWeek}&dates=${season}`);
  for (const event of board.events ?? []) {
    const c = event.competitions[0];
    const home = c.competitors.find((t) => t.homeAway === "home");
    const away = c.competitors.find((t) => t.homeAway === "away");
    if (!teamIds.has(home.team.abbreviation) || !teamIds.has(away.team.abbreviation)) {
      pendingPlayoffGames++; // matchup not decided yet (TBD)
      continue;
    }
    const statusName = c.status.type.name;
    schedule.push({
      kind: def.kind,
      week: def.number,
      game: {
        id: event.id,
        home_team: home.team.abbreviation,
        away_team: away.team.abbreviation,
        kickoff: event.date,
        status: GAME_STATUS[statusName] ?? (c.status.type.completed ? "final" : "in_progress"),
        home_score: home.score === undefined ? null : Number(home.score),
        away_score: away.score === undefined ? null : Number(away.score),
      },
    });
  }
}

const byPosition = {};
for (const p of players.values()) byPosition[p.position] = (byPosition[p.position] ?? 0) + 1;
console.log(`teams: ${teams.length}`);
console.log(`players: ${players.size}`, byPosition);
console.log(`games: ${schedule.length} (${schedule.filter((g) => g.kind === "playoff").length} playoff, ${pendingPlayoffGames} playoff games not set yet)`);
if (dryRun) process.exit(0);

// ── Write ───────────────────────────────────────────────────────────────────
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
if (!url || !secret) throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY (.env.local)");
const db = createClient(url, secret, { auth: { persistSession: false } });

async function upsert(table, rows, onConflict) {
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await db.from(table).upsert(rows.slice(i, i + 500), { onConflict });
    if (error) throw new Error(`${table}: ${error.message}`);
  }
}

await upsert("nfl_teams", teams, "id");

// Players who left every roster stay in the table (old lineups reference them) but go inactive.
const { error: deactivateError } = await db.from("nfl_players").update({ active: false }).neq("position", "DEF");
if (deactivateError) throw new Error(`nfl_players: ${deactivateError.message}`);
await upsert("nfl_players", [...players.values()], "id");

const { data: seasonRow, error: seasonError } = await db
  .from("seasons")
  .select("id")
  .eq("year", season)
  .single();
if (seasonError) throw new Error(`season ${season}: ${seasonError.message}`);

const weekRows = weekDefs.map((d) => ({ season_id: seasonRow.id, kind: d.kind, number: d.number, label: d.label }));
const { error: weeksError } = await db
  .from("weeks")
  .upsert(weekRows, { onConflict: "season_id,kind,number", ignoreDuplicates: true });
if (weeksError) throw new Error(`weeks: ${weeksError.message}`);

const { data: weeks, error: readWeeksError } = await db
  .from("weeks")
  .select("id, kind, number")
  .eq("season_id", seasonRow.id);
if (readWeeksError) throw new Error(`weeks: ${readWeeksError.message}`);
const weekId = new Map(weeks.map((w) => [`${w.kind}-${w.number}`, w.id]));

await upsert(
  "nfl_games",
  schedule.map(({ kind, week, game }) => ({ ...game, week_id: weekId.get(`${kind}-${week}`) })),
  "id",
);

console.log("import complete");
