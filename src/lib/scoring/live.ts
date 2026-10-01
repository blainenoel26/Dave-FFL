// Live week scoring straight from ESPN, computed on request and cached briefly by Next.js.
// Persisted snapshots (finalization, commissioner overrides) build on this later.
import { defenseId, parseEspnGame, scoreGame, type EspnSummary } from "./espn";
import type { ScoringRules } from "./rules";

const ESPN = "https://site.api.espn.com/apis/site/v2/sports/football/nfl";
const LIVE_SECONDS = 60;
const FINAL_SECONDS = 15 * 60;

export interface LiveGame {
  id: string;
  homeTeam: string;
  awayTeam: string;
  homeScore: number | null;
  awayScore: number | null;
  state: "pre" | "in" | "post";
  /** ESPN's short status, e.g. "Q3 5:12", "Halftime", "Final". */
  detail: string;
}

export interface WeekScores {
  games: LiveGame[];
  /** Fantasy points by player ID (and DEF-<team>) for every game that has started. */
  points: Map<string, number>;
  /** The stat line behind each player's (or DEF-<team>'s) points, stored when a week is finalized. */
  lines: Map<string, object>;
  /** Plays the parser couldn't place, for commissioner review. */
  warnings: string[];
  started: boolean;
  allFinal: boolean;
}

interface ScoreboardEvent {
  id: string;
  competitions: {
    status: { type: { state: LiveGame["state"]; shortDetail: string } };
    competitors: { homeAway: string; score?: string; team: { abbreviation: string } }[];
  }[];
}

async function getJson<T>(url: string, revalidate: number): Promise<T> {
  const res = await fetch(url, { next: { revalidate } });
  if (!res.ok) throw new Error(`ESPN ${res.status}: ${url}`);
  return res.json() as Promise<T>;
}

/** Scores for an ESPN week: seasonType 2 = regular season, 3 = postseason (ESPN week 5 = Super Bowl). */
export async function getWeekScores(
  season: number,
  week: number,
  rules: ScoringRules,
  seasonType: 2 | 3 = 2,
): Promise<WeekScores> {
  const board = await getJson<{ events: ScoreboardEvent[] }>(
    `${ESPN}/scoreboard?seasontype=${seasonType}&week=${week}&dates=${season}`,
    LIVE_SECONDS,
  );

  const games: LiveGame[] = (board.events ?? []).map((e) => {
    const c = e.competitions[0];
    const home = c.competitors.find((t) => t.homeAway === "home")!;
    const away = c.competitors.find((t) => t.homeAway === "away")!;
    const started = c.status.type.state !== "pre";
    return {
      id: e.id,
      homeTeam: home.team.abbreviation,
      awayTeam: away.team.abbreviation,
      homeScore: started ? Number(home.score ?? 0) : null,
      awayScore: started ? Number(away.score ?? 0) : null,
      state: c.status.type.state,
      detail: c.status.type.shortDetail,
    };
  });

  const points = new Map<string, number>();
  const lines = new Map<string, object>();
  const warnings: string[] = [];
  const summaries = await Promise.all(
    games
      .filter((g) => g.state !== "pre")
      .map((g) =>
        getJson<EspnSummary>(`${ESPN}/summary?event=${g.id}`, g.state === "post" ? FINAL_SECONDS : LIVE_SECONDS),
      ),
  );
  for (const summary of summaries) {
    const game = parseEspnGame(summary);
    for (const [id, p] of scoreGame(game, rules)) points.set(id, p);
    for (const p of game.players.values()) lines.set(p.playerId, { name: p.name, team: p.team, ...p.line });
    for (const [team, line] of game.defenses) lines.set(defenseId(team), { team, ...line });
    warnings.push(...game.warnings);
  }

  return {
    games,
    points,
    lines,
    warnings,
    started: games.some((g) => g.state !== "pre"),
    allFinal: games.length > 0 && games.every((g) => g.state === "post"),
  };
}
