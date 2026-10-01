// Timing for the playoff contest: which round is current, and which saved roster counts for a round.
import { emptyRoster, type PlayoffRoster } from "./rules";

/** ESPN's postseason week for each playoff round (ESPN week 4 is the Pro Bowl). */
export const ESPN_PLAYOFF_WEEK: Record<number, number> = { 1: 1, 2: 2, 3: 3, 4: 5 };

export interface RoundGame {
  homeTeam: string;
  awayTeam: string;
  kickoff: string; // ISO
  state: "pre" | "in" | "post";
  homeScore: number | null;
  awayScore: number | null;
}

export interface Round {
  id: number;
  number: number;
  label: string;
  games: RoundGame[];
}

/** The first round that isn't finished (or the last round). A round with no games yet isn't finished. */
export function currentRound<R extends Round>(rounds: readonly R[]): R | undefined {
  return rounds.find((r) => r.games.length === 0 || r.games.some((g) => g.state !== "post")) ?? rounds[rounds.length - 1];
}

/** A game of the round has kicked off and at least one game isn't final. */
export function roundInProgress(round: Round | undefined, now: Date): boolean {
  if (!round) return false;
  const started = round.games.some((g) => g.state !== "pre" || new Date(g.kickoff) <= now);
  return started && round.games.some((g) => g.state !== "post");
}

export function lastKickoff(round: Round): Date | null {
  if (!round.games.length) return null;
  return new Date(Math.max(...round.games.map((g) => new Date(g.kickoff).getTime())));
}

export interface RosterVersion {
  roster: PlayoffRoster;
  savedAt: string; // ISO
}

/** The roster as of a moment: the latest version saved at or before it (empty if none). */
export function rosterAt(versions: readonly RosterVersion[], at: Date): PlayoffRoster {
  let latest: RosterVersion | undefined;
  for (const v of versions) {
    if (new Date(v.savedAt) <= at && (!latest || v.savedAt > latest.savedAt)) latest = v;
  }
  return latest?.roster ?? emptyRoster();
}

/**
 * The roster that scores a round: as of the round's last kickoff. Every change that can still affect
 * the round (only players whose game hasn't started can change mid-round) is in by then, and
 * between-round swaps come after it.
 */
export function rosterForRound(versions: readonly RosterVersion[], round: Round, now: Date): PlayoffRoster {
  const last = lastKickoff(round);
  return rosterAt(versions, last && last < now ? last : now);
}
