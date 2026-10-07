// Playoff contest rules. See docs/LEAGUE-RULES.md → Playoffs.
//
// One cumulative contest from the Wild Card round through the Super Bowl. Each owner has 8 actives
// (the regular-season slots) and 2 reserve spots. Points count only for rounds a player is active.
//
// - An active locks at his own first playoff kickoff. Before that, his slot can change freely.
// - A locked active can only be replaced by swapping in an unused reserve, between rounds. The
//   replaced player moves into that reserve spot, which is then used up (2 substitutions total).
// - An unused reserve can be renamed at any time.
// - The x2 (never the QB) can move between rounds, or anytime neither player involved has played.
import { SLOTS, validateLineup, type LineupPick, type Position, type Slot } from "../league/lineup";

export const RESERVE_SLOTS = ["R1", "R2"] as const;
export type ReserveSlot = (typeof RESERVE_SLOTS)[number];

export interface Reserve {
  playerId: string | null;
  /** True once this spot's player was swapped in; it then holds the player who came out. */
  used: boolean;
}

export interface PlayoffRoster {
  actives: Partial<Record<Slot, string>>;
  doubled: Slot | null;
  reserves: Record<ReserveSlot, Reserve>;
}

export interface PlayoffContext {
  positionOf: (playerId: string) => Position | undefined;
  /** The player's team has kicked off at least one playoff game. */
  hasPlayed: (playerId: string) => boolean;
  /** The player's team's game in the current round has kicked off (or it has no game left). */
  roundGameStarted: (playerId: string) => boolean;
  /** A game in the current round has kicked off and the round isn't finished. */
  roundInProgress: boolean;
}

export function emptyRoster(): PlayoffRoster {
  return { actives: {}, doubled: null, reserves: { R1: { playerId: null, used: false }, R2: { playerId: null, used: false } } };
}

/** Every rule a change from `before` to `after` breaks; empty means the change is allowed. */
export function validateRosterChange(before: PlayoffRoster, after: PlayoffRoster, ctx: PlayoffContext): string[] {
  const errors: string[] = [];

  // Structure: positions, one x2, never the QB, no player twice.
  const picks: LineupPick[] = SLOTS.filter((s) => after.actives[s]).map((s) => ({
    slot: s,
    playerId: after.actives[s]!,
    position: ctx.positionOf(after.actives[s]!) ?? "QB",
    doubled: after.doubled === s,
  }));
  for (const p of picks) if (!ctx.positionOf(p.playerId)) errors.push(`Unknown player ${p.playerId}`);
  errors.push(...validateLineup(picks));
  if (after.doubled && !after.actives[after.doubled]) errors.push("The x2 slot is empty");
  const everyone = [
    ...picks.map((p) => p.playerId),
    ...RESERVE_SLOTS.map((r) => after.reserves[r].playerId).filter((id): id is string => id !== null),
  ];
  if (new Set(everyone).size !== everyone.length) errors.push("A player can't be both active and a reserve");

  // Reserve spots: used spots are frozen; a spot can't become unused again.
  const swappedIn = new Map<string, ReserveSlot>(); // reserve player → spot it came from
  for (const r of RESERVE_SLOTS) {
    const was = before.reserves[r];
    const now = after.reserves[r];
    if (was.used && (!now.used || now.playerId !== was.playerId)) {
      errors.push(`Reserve ${r} has been used and can't change`);
    } else if (!was.used && now.used) {
      if (was.playerId) swappedIn.set(was.playerId, r);
    }
  }

  // Active slots.
  for (const slot of SLOTS) {
    const out = before.actives[slot];
    const into = after.actives[slot];
    if (out === into) continue;

    if (out && ctx.hasPlayed(out)) {
      // A locked active: only a reserve swap, between rounds.
      const spot = into ? swappedIn.get(into) : undefined;
      if (ctx.roundInProgress) {
        errors.push(`${slot} is locked until the current round is over`);
      } else if (!spot) {
        errors.push(`${slot} is locked; swap a reserve in instead`);
      } else if (after.reserves[spot].playerId !== out) {
        errors.push(`The player swapped out of ${slot} must move to reserve ${spot}`);
      } else {
        swappedIn.delete(into!);
      }
    } else {
      if (into && ctx.roundGameStarted(into)) errors.push(`${slot}: that player's game has already started`);
      // A reserve can also be swapped in for a player who hasn't played yet.
      const spot = into ? swappedIn.get(into) : undefined;
      if (spot) {
        if (after.reserves[spot].playerId !== (out ?? null)) {
          errors.push(`The player swapped out of ${slot} must move to reserve ${spot}`);
        }
        swappedIn.delete(into!);
      }
    }
  }
  for (const [, spot] of swappedIn) errors.push(`Reserve ${spot} is marked used but wasn't swapped in`);

  // Unused reserves can be renamed freely; a new name just can't be someone already playing now.
  for (const r of RESERVE_SLOTS) {
    const now = after.reserves[r];
    if (!now.used && now.playerId && now.playerId !== before.reserves[r].playerId && !ctx.positionOf(now.playerId)) {
      errors.push(`Unknown player ${now.playerId}`);
    }
  }

  // The x2.
  const outDouble = before.doubled ? before.actives[before.doubled] : undefined;
  const intoDouble = after.doubled ? after.actives[after.doubled] : undefined;
  if (outDouble !== intoDouble && ctx.roundInProgress) {
    if ((outDouble && ctx.hasPlayed(outDouble)) || (intoDouble && ctx.hasPlayed(intoDouble))) {
      errors.push("The x2 can only move between rounds once its player has played");
    }
  }

  return errors;
}

/** A player's status for display: eliminated (red), still alive in a reserve spot (green). */
export function playerStatus(
  team: string,
  eliminated: ReadonlySet<string>,
  inReserve: boolean,
): "eliminated" | "reserve" | "active" {
  if (eliminated.has(team)) return "eliminated";
  return inReserve ? "reserve" : "active";
}

/** Teams knocked out: the loser of every finished playoff game. */
export function eliminatedTeams(
  games: readonly { homeTeam: string; awayTeam: string; homeScore: number | null; awayScore: number | null; final: boolean }[],
): Set<string> {
  const out = new Set<string>();
  for (const g of games) {
    if (!g.final || g.homeScore === null || g.awayScore === null || g.homeScore === g.awayScore) continue;
    out.add(g.homeScore > g.awayScore ? g.awayTeam : g.homeTeam);
  }
  return out;
}

export interface RoundLineup {
  actives: Partial<Record<Slot, string>>;
  doubled: Slot | null;
}

/** Cumulative playoff points: each round's actives score that round's points (x2 for the doubled). */
export function playoffTotal(rounds: readonly { lineup: RoundLineup; points: ReadonlyMap<string, number> }[]): number {
  let total = 0;
  for (const { lineup, points } of rounds) {
    for (const slot of SLOTS) {
      const id = lineup.actives[slot];
      if (id) total += (points.get(id) ?? 0) * (lineup.doubled === slot ? 2 : 1);
    }
  }
  return total;
}

/** Stands in for a player another owner can't see yet. */
export const HIDDEN_PLAYER = "hidden";

/**
 * Another owner's roster as the viewer may see it: players whose team hasn't played yet (actives
 * and reserves) are replaced by HIDDEN_PLAYER, and the x2 shows only once its player is visible.
 */
export function hideUnplayed(roster: PlayoffRoster, hasPlayed: (playerId: string) => boolean): PlayoffRoster {
  const show = (id: string | null | undefined) => (id ? (hasPlayed(id) ? id : HIDDEN_PLAYER) : id);
  const actives: Partial<Record<Slot, string>> = {};
  for (const slot of SLOTS) {
    const id = show(roster.actives[slot]);
    if (id) actives[slot] = id;
  }
  const doubledId = roster.doubled ? actives[roster.doubled] : undefined;
  return {
    actives,
    doubled: doubledId && doubledId !== HIDDEN_PLAYER ? roster.doubled : null,
    reserves: {
      R1: { ...roster.reserves.R1, playerId: show(roster.reserves.R1.playerId) ?? null },
      R2: { ...roster.reserves.R2, playerId: show(roster.reserves.R2.playerId) ?? null },
    },
  };
}
