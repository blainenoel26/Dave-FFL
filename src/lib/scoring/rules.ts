// Scoring rules as data. See docs/LEAGUE-RULES.md → Scoring.
// Stored per season (seasons.scoring) so rule changes don't need code changes.

/** Tiers are matched by the highest `minYards` not exceeding the distance (exact boundary → higher tier). */
export interface Tier {
  minYards: number;
  points: number;
}

/** Points-allowed bands; the first band whose `maxAllowed` is ≥ points allowed applies. */
export interface AllowedBand {
  maxAllowed: number | null; // null = no upper limit
  points: number;
}

export interface ScoringRules {
  passTd: Tier[];
  rushRecReturnTd: Tier[];
  passBonusThreshold: number;
  passBonusPoints: number;
  interceptionThrown: number;
  /** Successful 2-point conversions: the passer, and the player who runs or catches it. */
  twoPointPass: number;
  twoPointConversion: number;
  yardsPerPoint: number;
  fieldGoal: Tier[];
  extraPoint: number;
  defense: {
    turnover: number;
    safety: number;
    sack: number;
    touchdown: number;
    pointsAllowed: AllowedBand[];
  };
}

export const RULES_2026: ScoringRules = {
  passTd: [
    { minYards: 0, points: 4 },
    { minYards: 25, points: 6 },
    { minYards: 50, points: 8 },
  ],
  rushRecReturnTd: [
    { minYards: 0, points: 6 },
    { minYards: 25, points: 9 },
    { minYards: 50, points: 12 },
  ],
  passBonusThreshold: 300,
  passBonusPoints: 4,
  interceptionThrown: -1,
  twoPointPass: 1,
  twoPointConversion: 2,
  yardsPerPoint: 25,
  fieldGoal: [
    { minYards: 0, points: 3 },
    { minYards: 45, points: 5 },
  ],
  extraPoint: 1,
  defense: {
    turnover: 2,
    safety: 4,
    sack: 1,
    touchdown: 6,
    pointsAllowed: [
      { maxAllowed: 0, points: 7 },
      { maxAllowed: 9, points: 2 },
      { maxAllowed: 35, points: 0 },
      { maxAllowed: 50, points: -2 },
      { maxAllowed: null, points: -5 },
    ],
  },
};
