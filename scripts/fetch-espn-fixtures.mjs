// Saves trimmed ESPN game summaries for a week as test fixtures.
// Usage: node scripts/fetch-espn-fixtures.mjs <season> <week> [seasontype=2]
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [season, week, seasonType = "2"] = process.argv.slice(2);
if (!season || !week) throw new Error("usage: fetch-espn-fixtures.mjs <season> <week> [seasontype]");

const base = "https://site.api.espn.com/apis/site/v2/sports/football/nfl";
const get = async (url) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
};

const outDir = join("src", "lib", "scoring", "__fixtures__", `${season}-w${week}`);
mkdirSync(outDir, { recursive: true });

const board = await get(`${base}/scoreboard?seasontype=${seasonType}&week=${week}&dates=${season}`);
for (const event of board.events) {
  const summary = await get(`${base}/summary?event=${event.id}`);
  const trimmed = {
    header: {
      id: summary.header.id,
      competitions: summary.header.competitions.map((c) => ({
        date: c.date,
        status: { type: { name: c.status.type.name, completed: c.status.type.completed } },
        competitors: c.competitors.map((t) => ({
          homeAway: t.homeAway,
          score: t.score,
          team: { id: t.team.id, abbreviation: t.team.abbreviation },
        })),
      })),
    },
    boxscore: {
      players: summary.boxscore.players.map((p) => ({
        team: { id: p.team.id, abbreviation: p.team.abbreviation },
        statistics: p.statistics.map((g) => ({
          name: g.name,
          keys: g.keys,
          athletes: g.athletes.map((a) => ({
            athlete: { id: a.athlete.id, displayName: a.athlete.displayName },
            stats: a.stats,
          })),
        })),
      })),
    },
    scoringPlays: (summary.scoringPlays ?? []).map((p) => ({
      type: { text: p.type.text },
      text: p.text,
      team: { abbreviation: p.team.abbreviation },
    })),
  };
  const name = event.competitions[0].competitors
    .map((t) => t.team.abbreviation)
    .reverse()
    .join("-at-");
  writeFileSync(join(outDir, `${name}.json`), JSON.stringify(trimmed));
  console.log("saved", name);
}
