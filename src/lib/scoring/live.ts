// Live week scoring straight from ESPN, computed on request and cached briefly by Next.js.
// Persisted snapshots (finalization, commissioner overrides) build on this later.
import { parseEspnGame, scoreGame, type EspnSummary } from "./espn";
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

export async function getWeekScores(season: number, week: number, rules: ScoringRules): Promise<WeekScores> {
  const board = await getJson<{ events: ScoreboardEvent[] }>(
    `${ESPN}/scoreboard?seasontype=2&week=${week}&dates=${season}`,
    LIVE_SECONDS,
  );

  const games: LiveGame[] = board.events.map((e) => {
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
    warnings.push(...game.warnings);
  }

  return {
    games,
    points,
    warnings,
    started: games.some((g) => g.state !== "pre"),
    allFinal: games.length > 0 && games.every((g) => g.state === "post"),
  };
}
