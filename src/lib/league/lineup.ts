// Lineup structure, validation and totals. See docs/LEAGUE-RULES.md → Lineup.

export const SLOTS = ["QB", "RB1", "RB2", "WR1", "WR2", "WR3", "K", "DEF"] as const;
export type Slot = (typeof SLOTS)[number];

export type Position = "QB" | "RB" | "WR" | "TE" | "K" | "DEF";

const ELIGIBLE: Record<Slot, readonly Position[]> = {
  QB: ["QB"],
  RB1: ["RB"],
  RB2: ["RB"],
  WR1: ["WR", "TE"],
  WR2: ["WR", "TE"],
  WR3: ["WR", "TE"],
  K: ["K"],
  DEF: ["DEF"],
};

export interface LineupPick {
  slot: Slot;
  playerId: string;
  position: Position;
  doubled?: boolean;
}

export function isEligible(slot: Slot, position: Position): boolean {
  return ELIGIBLE[slot].includes(position);
}

/** Returns a list of rule violations; empty means valid. Partial lineups are allowed. */
export function validateLineup(picks: readonly LineupPick[]): string[] {
  const errors: string[] = [];
  const seenSlots = new Set<Slot>();
  const seenPlayers = new Set<string>();

  for (const pick of picks) {
    if (seenSlots.has(pick.slot)) errors.push(`${pick.slot} is filled more than once`);
    seenSlots.add(pick.slot);

    if (seenPlayers.has(pick.playerId)) errors.push(`${pick.playerId} is picked more than once`);
    seenPlayers.add(pick.playerId);

    if (!isEligible(pick.slot, pick.position)) {
      errors.push(`${pick.position} cannot play the ${pick.slot} slot`);
    }
  }

  const doubled = picks.filter((p) => p.doubled);
  if (doubled.length > 1) errors.push("Only one player can be doubled");
  if (doubled.some((p) => p.slot === "QB")) errors.push("The QB cannot be doubled");

  return errors;
}

/** Lineup total from per-player points. Players without points yet count as 0. */
export function lineupTotal(
  picks: readonly LineupPick[],
  pointsByPlayer: Readonly<Record<string, number>>,
): number {
  return picks.reduce((sum, pick) => {
    const points = pointsByPlayer[pick.playerId] ?? 0;
    return sum + (pick.doubled ? points * 2 : points);
  }, 0);
}
