// Pure scoring: normalized stat lines → fantasy points. Feed-specific parsing lives in espn.ts.
import type { AllowedBand, ScoringRules, Tier } from "./rules";

/** One player's stats for one game. TD arrays hold the length of each touchdown in yards. */
export interface OffenseLine {
  passYards: number;
  interceptions: number;
  rushYards: number;
  recYards: number;
  returnYards: number;
  passTds: number[];
  rushTds: number[];
  recTds: number[];
  returnTds: number[];
  fieldGoals: number[];
  extraPoints: number;
  /** Successful 2-point conversions thrown, and run or caught. */
  twoPointPasses: number;
  twoPointConversions: number;
}

export interface DefenseLine {
  sacks: number;
  turnovers: number;
  safeties: number;
  touchdowns: number;
  pointsAllowed: number;
}

export function emptyOffenseLine(): OffenseLine {
  return {
    passYards: 0, interceptions: 0, rushYards: 0, recYards: 0, returnYards: 0,
    passTds: [], rushTds: [], recTds: [], returnTds: [],
    fieldGoals: [], extraPoints: 0, twoPointPasses: 0, twoPointConversions: 0,
  };
}

export function tierPoints(tiers: readonly Tier[], yards: number): number {
  let points = 0;
  for (const tier of tiers) if (yards >= tier.minYards) points = tier.points;
  return points;
}

function perCompleted(yards: number, per: number): number {
  return yards > 0 ? Math.floor(yards / per) : 0;
}

function allowedPoints(bands: readonly AllowedBand[], allowed: number): number {
  const band = bands.find((b) => b.maxAllowed === null || allowed <= b.maxAllowed);
  return band?.points ?? 0;
}

export function scoreOffense(line: OffenseLine, rules: ScoringRules): number {
  const sumTiers = (tiers: readonly Tier[], tds: readonly number[]) =>
    tds.reduce((sum, yards) => sum + tierPoints(tiers, yards), 0);

  let points = 0;
  points += sumTiers(rules.passTd, line.passTds);
  if (line.passYards >= rules.passBonusThreshold) {
    points += rules.passBonusPoints;
    points += perCompleted(line.passYards - rules.passBonusThreshold, rules.yardsPerPoint);
  }
  points += line.interceptions * rules.interceptionThrown;

  // Rushing, receiving and return yards are floored independently.
  points += perCompleted(line.rushYards, rules.yardsPerPoint);
  points += perCompleted(line.recYards, rules.yardsPerPoint);
  points += perCompleted(line.returnYards, rules.yardsPerPoint);
  points += sumTiers(rules.rushRecReturnTd, line.rushTds);
  points += sumTiers(rules.rushRecReturnTd, line.recTds);
  points += sumTiers(rules.rushRecReturnTd, line.returnTds);

  points += sumTiers(rules.fieldGoal, line.fieldGoals);
  points += line.extraPoints * rules.extraPoint;
  points += line.twoPointPasses * rules.twoPointPass;
  points += line.twoPointConversions * rules.twoPointConversion;
  return points;
}

export function scoreDefense(line: DefenseLine, rules: ScoringRules): number {
  const d = rules.defense;
  return (
    line.sacks * d.sack +
    line.turnovers * d.turnover +
    line.safeties * d.safety +
    line.touchdowns * d.touchdown +
    allowedPoints(d.pointsAllowed, line.pointsAllowed)
  );
}
