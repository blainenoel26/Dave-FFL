// Prints row counts and basic health checks. Shows no personal data.
//   node --env-file=.env.local scripts/check-db.mjs
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const admin = createClient(url, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const anon = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });

for (const table of ["seasons", "owners", "season_owners", "nfl_teams", "nfl_players", "weeks", "nfl_games"]) {
  const { count, error } = await admin.from(table).select("*", { count: "exact", head: true });
  console.log(table.padEnd(14), error ? `ERROR ${error.message}` : count);
}

const { data: owners } = await admin.from("owners").select("owner_code, role, auth_user_id").order("owner_code");
console.log("owners signed in:", owners.filter((o) => o.auth_user_id).map((o) => o.owner_code).join(", ") || "none");
console.log("commissioners:", owners.filter((o) => o.role === "commissioner").map((o) => o.owner_code).join(", "));

const { data: week4 } = await admin
  .from("weeks")
  .select("label, nfl_games(kickoff, away_team, home_team, status)")
  .eq("kind", "regular")
  .eq("number", 4)
  .single();
const games = week4.nfl_games.sort((a, b) => a.kickoff.localeCompare(b.kickoff));
console.log(`${week4.label}: ${games.length} games, first ${games[0].away_team}@${games[0].home_team} ${games[0].kickoff}`);

const { data: leaked } = await anon.from("owners").select("owner_code");
console.log("signed-out visitor can read owners:", leaked?.length ? "YES (problem)" : "no");
