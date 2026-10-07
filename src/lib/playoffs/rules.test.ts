import { describe, expect, it } from "vitest";
import type { Position } from "../league/lineup";
import {
  HIDDEN_PLAYER,
  eliminatedTeams,
  hideUnplayed,
  emptyRoster,
  playerStatus,
  playoffTotal,
  validateRosterChange,
  type PlayoffContext,
  type PlayoffRoster,
} from "./rules";

const POS: Record<string, Position> = {
  qb1: "QB", qb2: "QB", rb1: "RB", rb2: "RB", rb3: "RB", wr1: "WR", wr2: "WR", wr3: "TE", wr4: "WR",
  k1: "K", def1: "DEF", byeRb: "RB",
};

function ctx(over: Partial<PlayoffContext> & { played?: string[]; started?: string[] } = {}): PlayoffContext {
  const played = new Set(over.played ?? []);
  const started = new Set(over.started ?? []);
  return {
    positionOf: (id) => POS[id],
    hasPlayed: (id) => played.has(id),
    roundGameStarted: (id) => started.has(id),
    roundInProgress: false,
    ...over,
  };
}

function roster(patch: Partial<PlayoffRoster> = {}): PlayoffRoster {
  return {
    ...emptyRoster(),
    actives: { QB: "qb1", RB1: "rb1", RB2: "rb2", WR1: "wr1", WR2: "wr2", WR3: "wr3", K: "k1", DEF: "def1" },
    doubled: "RB1",
    reserves: { R1: { playerId: "qb2", used: false }, R2: { playerId: "wr4", used: false } },
    ...patch,
  };
}

describe("validateRosterChange", () => {
  it("accepts initial picks before any games", () => {
    expect(validateRosterChange(emptyRoster(), roster(), ctx())).toEqual([]);
  });

  it("lets an unplayed active change mid-round (e.g. a bye team)", () => {
    const before = roster({ actives: { ...roster().actives, RB2: "byeRb" } });
    const after = roster({ actives: { ...roster().actives, RB2: "rb3" } });
    expect(validateRosterChange(before, after, ctx({ played: ["qb1", "rb1"], roundInProgress: true }))).toEqual([]);
  });

  it("refuses to change a player who has played, except by reserve swap", () => {
    const after = roster({ actives: { ...roster().actives, RB1: "rb3" } });
    expect(validateRosterChange(roster(), after, ctx({ played: ["rb1"] }))).toContain(
      "RB1 is locked; swap a reserve in instead",
    );
  });

  it("swaps a reserve in between rounds; the old player moves to that spot and it's used up", () => {
    const after = roster({
      actives: { ...roster().actives, QB: "qb2" },
      reserves: { R1: { playerId: "qb1", used: true }, R2: { playerId: "wr4", used: false } },
    });
    expect(validateRosterChange(roster(), after, ctx({ played: ["qb1"] }))).toEqual([]);
  });

  it("also lets a reserve swap in for a player who hasn't played yet, mid-round", () => {
    const after = roster({
      actives: { ...roster().actives, QB: "qb2" },
      reserves: { R1: { playerId: "qb1", used: true }, R2: { playerId: "wr4", used: false } },
    });
    expect(validateRosterChange(roster(), after, ctx({ played: ["rb1"], roundInProgress: true }))).toEqual([]);
  });

  it("requires the swapped-out player to go to the reserve spot", () => {
    const after = roster({
      actives: { ...roster().actives, QB: "qb2" },
      reserves: { R1: { playerId: null, used: true }, R2: { playerId: "wr4", used: false } },
    });
    expect(validateRosterChange(roster(), after, ctx({ played: ["qb1"] }))).toContain(
      "The player swapped out of QB must move to reserve R1",
    );
  });

  it("doesn't allow swaps while a round is in progress", () => {
    const after = roster({
      actives: { ...roster().actives, QB: "qb2" },
      reserves: { R1: { playerId: "qb1", used: true }, R2: { playerId: "wr4", used: false } },
    });
    expect(validateRosterChange(roster(), after, ctx({ played: ["qb1"], roundInProgress: true }))).toContain(
      "QB is locked until the current round is over",
    );
  });

  it("lets an unused reserve be renamed any time, but freezes a used one", () => {
    const renamed = roster({ reserves: { R1: { playerId: "rb3", used: false }, R2: { playerId: "wr4", used: false } } });
    expect(validateRosterChange(roster(), renamed, ctx({ roundInProgress: true }))).toEqual([]);

    const used = roster({ reserves: { R1: { playerId: "qb1", used: true }, R2: { playerId: "wr4", used: false } } });
    const changed = roster({ reserves: { R1: { playerId: "rb3", used: true }, R2: { playerId: "wr4", used: false } } });
    expect(validateRosterChange(used, changed, ctx())).toContain("Reserve R1 has been used and can't change");
  });

  it("moves the x2 between rounds but not mid-round once its player has played", () => {
    const moved = roster({ doubled: "WR1" });
    expect(validateRosterChange(roster(), moved, ctx({ played: ["rb1", "wr1"] }))).toEqual([]);
    expect(validateRosterChange(roster(), moved, ctx({ played: ["rb1"], roundInProgress: true }))).toContain(
      "The x2 can only move between rounds once its player has played",
    );
  });

  it("never doubles the QB and keeps positions in their slots", () => {
    expect(validateRosterChange(emptyRoster(), roster({ doubled: "QB" }), ctx())).toContain("The QB cannot be doubled");
    const wrong = roster({ actives: { ...roster().actives, K: "def1", DEF: "k1" } });
    expect(validateRosterChange(emptyRoster(), wrong, ctx()).length).toBeGreaterThan(0);
  });

  it("doesn't allow a player to be both active and a reserve", () => {
    const dup = roster({ reserves: { R1: { playerId: "qb1", used: false }, R2: { playerId: "wr4", used: false } } });
    expect(validateRosterChange(emptyRoster(), dup, ctx())).toContain("A player can't be both active and a reserve");
  });
});

describe("playoffTotal", () => {
  it("adds each round's actives, doubling the x2 for the rounds it was held", () => {
    const total = playoffTotal([
      { lineup: { actives: { QB: "qb1", RB1: "rb1" }, doubled: "RB1" }, points: new Map([["qb1", 10], ["rb1", 5]]) },
      { lineup: { actives: { QB: "qb2", RB1: "rb1" }, doubled: null }, points: new Map([["qb1", 99], ["qb2", 7], ["rb1", 3]]) },
    ]);
    expect(total).toBe(10 + 5 * 2 + 7 + 3);
  });
});

describe("eliminations", () => {
  it("knocks out the loser of each finished game", () => {
    const out = eliminatedTeams([
      { homeTeam: "PHI", awayTeam: "GB", homeScore: 22, awayScore: 10, final: true },
      { homeTeam: "BUF", awayTeam: "DEN", homeScore: 7, awayScore: 3, final: false },
    ]);
    expect([...out]).toEqual(["GB"]);
  });

  it("colors eliminated players red and live reserves green", () => {
    const out = new Set(["GB"]);
    expect(playerStatus("GB", out, true)).toBe("eliminated");
    expect(playerStatus("PHI", out, true)).toBe("reserve");
    expect(playerStatus("PHI", out, false)).toBe("active");
  });
});

describe("hideUnplayed", () => {
  it("hides players who haven't played, actives and reserves, and an unplayed x2", () => {
    const played = new Set(["qb1", "rb1", "wr4"]);
    const shown = hideUnplayed(roster({ doubled: "RB2" }), (id) => played.has(id));
    expect(shown.actives.QB).toBe("qb1");
    expect(shown.actives.RB2).toBe(HIDDEN_PLAYER);
    expect(shown.doubled).toBeNull();
    expect(shown.reserves.R1.playerId).toBe(HIDDEN_PLAYER);
    expect(shown.reserves.R2.playerId).toBe("wr4");
  });

  it("shows the x2 once its player has played, and leaves empty spots empty", () => {
    const shown = hideUnplayed({ ...emptyRoster(), actives: { RB1: "rb1" }, doubled: "RB1" }, () => true);
    expect(shown.doubled).toBe("RB1");
    expect(shown.actives.QB).toBeUndefined();
    expect(shown.reserves.R1.playerId).toBeNull();
  });
});
