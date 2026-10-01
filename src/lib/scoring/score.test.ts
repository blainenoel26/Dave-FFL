import { describe, expect, it } from "vitest";
import { RULES_2026 } from "./rules";
import { emptyOffenseLine, scoreDefense, scoreOffense, tierPoints, type DefenseLine, type OffenseLine } from "./score";

const offense = (patch: Partial<OffenseLine>) => scoreOffense({ ...emptyOffenseLine(), ...patch }, RULES_2026);
const defense = (patch: Partial<DefenseLine>) =>
  scoreDefense({ sacks: 0, turnovers: 0, safeties: 0, touchdowns: 0, pointsAllowed: 20, ...patch }, RULES_2026);

describe("tiers", () => {
  it("scores an exact boundary at the higher tier", () => {
    expect(tierPoints(RULES_2026.passTd, 24)).toBe(4);
    expect(tierPoints(RULES_2026.passTd, 25)).toBe(6);
    expect(tierPoints(RULES_2026.passTd, 50)).toBe(8);
    expect(tierPoints(RULES_2026.fieldGoal, 44)).toBe(3);
    expect(tierPoints(RULES_2026.fieldGoal, 45)).toBe(5);
  });
});

describe("scoreOffense", () => {
  it("matches the worked QB example from the rules discussion", () => {
    // 325 pass yds, TDs of 10 and 30, 30 rush yds → 4 + 6 + 4 + 1 + 1
    expect(offense({ passYards: 325, passTds: [10, 30], rushYards: 30 })).toBe(16);
  });

  it("gives nothing for passing yards under 300", () => {
    expect(offense({ passYards: 299 })).toBe(0);
  });

  it("takes a point per interception thrown", () => {
    expect(offense({ passTds: [2], interceptions: 1 })).toBe(3);
  });

  it("floors rushing, receiving and return yards separately", () => {
    expect(offense({ rushYards: 24, recYards: 24, returnYards: 24 })).toBe(0);
    expect(offense({ rushYards: 50, recYards: 25, returnYards: 75 })).toBe(6);
  });

  it("never goes negative on yards", () => {
    expect(offense({ rushYards: -8 })).toBe(0);
  });

  it("scores return TDs like rushing TDs", () => {
    expect(offense({ returnTds: [86] })).toBe(12);
  });

  it("scores 2-point conversions: 1 for the pass, 2 for the run or catch", () => {
    expect(offense({ twoPointPasses: 1 })).toBe(1);
    expect(offense({ twoPointConversions: 2 })).toBe(4);
  });

  it("scores kickers", () => {
    expect(offense({ fieldGoals: [50, 38], extraPoints: 3 })).toBe(11);
  });
});

describe("scoreDefense", () => {
  it("uses the points-allowed bands without stacking", () => {
    expect(defense({ pointsAllowed: 0 })).toBe(7);
    expect(defense({ pointsAllowed: 9 })).toBe(2);
    expect(defense({ pointsAllowed: 10 })).toBe(0);
    expect(defense({ pointsAllowed: 35 })).toBe(0);
    expect(defense({ pointsAllowed: 36 })).toBe(-2);
    expect(defense({ pointsAllowed: 50 })).toBe(-2);
    expect(defense({ pointsAllowed: 51 })).toBe(-5);
  });

  it("adds sacks, takeaways, safeties and TDs", () => {
    expect(defense({ sacks: 3, turnovers: 2, safeties: 1, touchdowns: 1 })).toBe(3 + 4 + 4 + 6);
  });
});
