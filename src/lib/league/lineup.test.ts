import { describe, expect, it } from "vitest";
import { lineupTotal, validateLineup, type LineupPick } from "./lineup";

// 2026 week 3, owner09's lineup from the league sheet (118 points).
const week3: LineupPick[] = [
  { slot: "QB", playerId: "josh-allen", position: "QB" },
  { slot: "RB1", playerId: "jahmyr-gibbs", position: "RB", doubled: true },
  { slot: "RB2", playerId: "kenneth-walker", position: "RB" },
  { slot: "WR1", playerId: "jaxon-smith-njigba", position: "WR" },
  { slot: "WR2", playerId: "amon-ra-st-brown", position: "WR" },
  { slot: "WR3", playerId: "jamarr-chase", position: "WR" },
  { slot: "K", playerId: "brandon-aubrey", position: "K" },
  { slot: "DEF", playerId: "chiefs", position: "DEF" },
];

const week3Points: Record<string, number> = {
  "josh-allen": 10,
  "jahmyr-gibbs": 23,
  "kenneth-walker": 15,
  "jaxon-smith-njigba": 17,
  "amon-ra-st-brown": 6,
  "jamarr-chase": 9,
  "brandon-aubrey": 11,
  chiefs: 4,
};

describe("lineupTotal", () => {
  it("reproduces a sheet total with the doubled pick", () => {
    expect(lineupTotal(week3, week3Points)).toBe(118);
  });

  it("counts players without stats yet as 0", () => {
    expect(lineupTotal(week3, {})).toBe(0);
  });
});

describe("validateLineup", () => {
  it("accepts a full valid lineup", () => {
    expect(validateLineup(week3)).toEqual([]);
  });

  it("accepts a partial lineup", () => {
    expect(validateLineup(week3.slice(0, 3))).toEqual([]);
  });

  it("allows a TE in a WR slot", () => {
    expect(validateLineup([{ slot: "WR1", playerId: "te", position: "TE" }])).toEqual([]);
  });

  it("rejects a kicker and defense in each other's slots", () => {
    const swapped: LineupPick[] = [
      { slot: "K", playerId: "steelers", position: "DEF" },
      { slot: "DEF", playerId: "cameron-dicker", position: "K" },
    ];
    expect(validateLineup(swapped)).toHaveLength(2);
  });

  it("rejects a doubled QB", () => {
    expect(validateLineup([{ ...week3[0], doubled: true }])).toContain("The QB cannot be doubled");
  });

  it("rejects more than one doubled pick", () => {
    const twoDoubled = week3.map((p) => (p.slot === "K" ? { ...p, doubled: true } : p));
    expect(validateLineup(twoDoubled)).toContain("Only one player can be doubled");
  });

  it("rejects the same player twice", () => {
    const dup: LineupPick[] = [
      { slot: "WR1", playerId: "jamarr-chase", position: "WR" },
      { slot: "WR2", playerId: "jamarr-chase", position: "WR" },
    ];
    expect(validateLineup(dup)).toContain("jamarr-chase is picked more than once");
  });
});
