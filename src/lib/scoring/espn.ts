// Turns an ESPN game summary (site.api.espn.com …/summary?event=) into normalized stat lines.
// Yards come from the box score; touchdown and field-goal lengths come from the scoring plays.
// Anything the parser can't place is returned as a warning for the commissioner to review.
import type { ScoringRules } from "./rules";
import { emptyOffenseLine, scoreDefense, scoreOffense, type DefenseLine, type OffenseLine } from "./score";

// ── Minimal shape of the ESPN summary we rely on ────────────────────────────
export interface EspnSummary {
  header: {
    id: string;
    competitions: {
      status: { type: { name: string; completed: boolean } };
      competitors: { homeAway: string; score?: string; team: { abbreviation: string } }[];
    }[];
  };
  boxscore: {
    players?: {
      team: { abbreviation: string };
      statistics: {
        name: string;
        keys: string[];
        athletes: { athlete: { id: string; displayName: string }; stats: string[] }[];
      }[];
    }[];
  };
  scoringPlays?: { type?: { text?: string }; text: string; team?: { abbreviation?: string } }[];
}

export interface PlayerGame {
  playerId: string;
  name: string;
  team: string;
  line: OffenseLine;
}

export interface GameStats {
  gameId: string;
  completed: boolean;
  players: Map<string, PlayerGame>;
  defenses: Map<string, DefenseLine>; // keyed by team abbreviation
  warnings: string[];
}

export const defenseId = (team: string) => `DEF-${team}`;

// ── Name matching ───────────────────────────────────────────────────────────
const SUFFIXES = new Set(["jr", "sr", "ii", "iii", "iv", "v"]);

export function nameKey(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[.'’]/g, "")
    .split(/[\s-]+/)
    .filter((part) => part && !SUFFIXES.has(part))
    .join(" ");
}

// ── Scoring-play patterns (text first: ESPN's play type is sometimes wrong) ─
const LATERAL = /^(.+?) complete pass to (.+?) for (-?\d+) yards?((?:, lateral to .+? for -?\d+ yards?)+)/i;
const LATERAL_LEG = /lateral to (.+?) for (-?\d+) yards?/gi;
const PASS_TD = /^(.+?) (\d+) Yd pass from (.+?)(?: \(|$)/i;
const RUSH_TD = /^(.+?) (\d+) Yd (?:Rush|Run)\b/i;
const FIELD_GOAL = /^(.+?) (\d+) Yd Field Goal/i;
const RETURN_TD = /^(.+?) (\d+) Yd (?:Kickoff|Kick|Punt) Return/i;
const DEFENSE_TD = /Interception Return|Fumble Return|Fumble Recovery|Blocked|Missed Field Goal Return/i;
const SAFETY = /safety/i;
// A standalone 2-point play (e.g. a defensive PAT return). Not scored. Only the text before any
// "(…)" counts: a touchdown's description often mentions its extra-point try in parentheses.
const TWO_POINT = /Defensive PAT|Two-Point|2pt|two point/i;

function stat(keys: string[], stats: string[], key: string): string | undefined {
  const i = keys.indexOf(key);
  return i >= 0 ? stats[i] : undefined;
}

function num(value: string | undefined): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function parseEspnGame(summary: EspnSummary): GameStats {
  const competition = summary.header.competitions[0];
  const teams = competition.competitors.map((c) => c.team.abbreviation);
  const score = new Map(competition.competitors.map((c) => [c.team.abbreviation, num(c.score)]));
  const opponent = (team: string) => teams.find((t) => t !== team) ?? team;

  const players = new Map<string, PlayerGame>();
  const byName = new Map<string, PlayerGame[]>(); // `${team}|${nameKey}`
  const warnings: string[] = [];
  const boxTds = new Map<string, { pass: number; rush: number; rec: number; ret: number }>();

  const player = (id: string, name: string, team: string): PlayerGame => {
    let p = players.get(id);
    if (!p) {
      p = { playerId: id, name, team, line: emptyOffenseLine() };
      players.set(id, p);
      const key = `${team}|${nameKey(name)}`;
      byName.set(key, [...(byName.get(key) ?? []), p]);
    }
    return p;
  };
  const tds = (id: string) => {
    let t = boxTds.get(id);
    if (!t) boxTds.set(id, (t = { pass: 0, rush: 0, rec: 0, ret: 0 }));
    return t;
  };

  const timesSacked = new Map<string, number>();
  const giveaways = new Map<string, number>();
  const add = (map: Map<string, number>, team: string, n: number) => map.set(team, (map.get(team) ?? 0) + n);

  // ── Box score: yards, extra points, and the defensive counts ──
  for (const side of summary.boxscore.players ?? []) {
    const team = side.team.abbreviation;
    for (const group of side.statistics) {
      for (const { athlete, stats } of group.athletes) {
        const get = (key: string) => stat(group.keys, stats, key);
        const p = player(athlete.id, athlete.displayName, team);
        switch (group.name) {
          case "passing":
            p.line.passYards += num(get("passingYards"));
            p.line.interceptions += num(get("interceptions"));
            tds(athlete.id).pass += num(get("passingTouchdowns"));
            add(timesSacked, team, num(get("sacks-sackYardsLost")?.split("-")[0]));
            add(giveaways, team, num(get("interceptions")));
            break;
          case "rushing":
            p.line.rushYards += num(get("rushingYards"));
            tds(athlete.id).rush += num(get("rushingTouchdowns"));
            break;
          case "receiving":
            p.line.recYards += num(get("receivingYards"));
            tds(athlete.id).rec += num(get("receivingTouchdowns"));
            break;
          case "kickReturns":
            p.line.returnYards += num(get("kickReturnYards"));
            tds(athlete.id).ret += num(get("kickReturnTouchdowns"));
            break;
          case "puntReturns":
            p.line.returnYards += num(get("puntReturnYards"));
            tds(athlete.id).ret += num(get("puntReturnTouchdowns"));
            break;
          case "kicking":
            p.line.extraPoints += num(get("extraPointsMade/extraPointAttempts")?.split("/")[0]);
            break;
          case "fumbles":
            add(giveaways, team, num(get("fumblesLost")));
            break;
        }
      }
    }
  }

  const find = (team: string, name: string, play: string): PlayerGame | undefined => {
    const matches = byName.get(`${team}|${nameKey(name)}`) ?? [];
    if (matches.length === 1) return matches[0];
    warnings.push(
      matches.length === 0
        ? `No ${team} player named "${name}" in the box score: ${play}`
        : `More than one ${team} player named "${name}": ${play}`,
    );
    return undefined;
  };

  // ── Scoring plays: TD and FG lengths, defensive TDs and safeties ──
  const defTds = new Map<string, number>();
  const safeties = new Map<string, number>();

  for (const play of summary.scoringPlays ?? []) {
    const team = play.team?.abbreviation ?? "";
    const text = play.text.trim();
    const typeText = play.type?.text ?? "";
    let m: RegExpMatchArray | null;

    if (TWO_POINT.test(text.split("(")[0]) || TWO_POINT.test(typeText)) {
      continue;
    } else if ((m = text.match(LATERAL))) {
      const legs = [...m[4].matchAll(LATERAL_LEG)];
      const total = num(m[3]) + legs.reduce((sum, leg) => sum + num(leg[2]), 0);
      const scorer = legs[legs.length - 1][1];
      find(team, m[1], text)?.line.passTds.push(total);
      find(team, scorer, text)?.line.recTds.push(total);
      warnings.push(`Lateral touchdown scored as a ${total}-yard pass and catch: ${text}`);
    } else if ((m = text.match(PASS_TD))) {
      find(team, m[1], text)?.line.recTds.push(num(m[2]));
      find(team, m[3], text)?.line.passTds.push(num(m[2]));
    } else if ((m = text.match(RUSH_TD))) {
      find(team, m[1], text)?.line.rushTds.push(num(m[2]));
    } else if ((m = text.match(FIELD_GOAL))) {
      find(team, m[1], text)?.line.fieldGoals.push(num(m[2]));
    } else if ((m = text.match(RETURN_TD))) {
      find(team, m[1], text)?.line.returnTds.push(num(m[2]));
    } else if (DEFENSE_TD.test(text) || DEFENSE_TD.test(typeText)) {
      add(defTds, team, 1);
    } else if (SAFETY.test(text) || SAFETY.test(typeText)) {
      add(safeties, team, 1);
    } else {
      warnings.push(`Unrecognized scoring play (${typeText || "no type"}): ${text}`);
    }
  }

  // ── Cross-check TD counts against the box score ──
  for (const [id, box] of boxTds) {
    const p = players.get(id)!;
    const checks: [string, number, number][] = [
      ["passing", box.pass, p.line.passTds.length],
      ["rushing", box.rush, p.line.rushTds.length],
      ["receiving", box.rec, p.line.recTds.length],
      ["return", box.ret, p.line.returnTds.length],
    ];
    for (const [kind, expected, parsed] of checks) {
      if (expected !== parsed) {
        warnings.push(`${p.name} (${p.team}): box score has ${expected} ${kind} TD, scoring plays have ${parsed}`);
      }
    }
  }

  const defenses = new Map<string, DefenseLine>();
  for (const team of teams) {
    const opp = opponent(team);
    defenses.set(team, {
      sacks: timesSacked.get(opp) ?? 0,
      turnovers: giveaways.get(opp) ?? 0,
      safeties: safeties.get(team) ?? 0,
      touchdowns: defTds.get(team) ?? 0,
      pointsAllowed: score.get(opp) ?? 0,
    });
  }

  return {
    gameId: summary.header.id,
    completed: competition.status.type.completed,
    players,
    defenses,
    warnings,
  };
}

/** Fantasy points for every player and team defense in a game, keyed by player ID / DEF-<team>. */
export function scoreGame(game: GameStats, rules: ScoringRules): Map<string, number> {
  const points = new Map<string, number>();
  for (const p of game.players.values()) points.set(p.playerId, scoreOffense(p.line, rules));
  for (const [team, line] of game.defenses) points.set(defenseId(team), scoreDefense(line, rules));
  return points;
}
