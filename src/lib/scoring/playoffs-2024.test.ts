import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { defenseId, nameKey, parseEspnGame, scoreGame, type EspnSummary, type GameStats } from "./espn";
import { RULES_2026 } from "./rules";

// The 2024–25 NFL playoffs, checked against the league's "2025" playoff sheet (per-round points).
const ROUNDS: Record<string, Record<string, number>> = {
  "2024-p1": {
    "Saquon Barkley": 4, "Derrick Henry": 22, "Lamar Jackson": 11, "Tyler Bass": 11, "DEF-PHI": 10,
    "DEF-BUF": 4, "Terry McLaurin": 9, "Puka Nacua": 1, "Mike Evans": 9, "A.J. Brown": 0,
  },
  "2024-p2": {
    "Saquon Barkley": 33, "Derrick Henry": 9, "Josh Allen": 12, "Lamar Jackson": 8, "Jalen Hurts": 11,
    "Jahmyr Gibbs": 18, "Tyler Bass": 11, "Harrison Butker": 11, "Justin Tucker": 9, "Jake Bates": 7,
    "DEF-KC": 8, "DEF-BUF": 8, "DEF-BAL": 1, "DEF-DET": -2, "Terry McLaurin": 15, "Puka Nacua": 3,
    "Travis Kelce": 10, "Amon-Ra St. Brown": 5, "Mark Andrews": 2, "A.J. Brown": 0, "James Cook": 2,
    "Nico Collins": 3, "Sam LaPorta": 8,
  },
  "2024-p3": {
    "Saquon Barkley": 28, "Josh Allen": 11, "Jalen Hurts": 22, "Tyler Bass": 7, "Harrison Butker": 6,
    "DEF-PHI": 11, "DEF-KC": 2, "DEF-BUF": 4, "A.J. Brown": 9, "Travis Kelce": 0, "Kareem Hunt": 8,
    "Khalil Shakir": 1, "Jake Elliott": 7, "Curtis Samuel": 6, "James Cook": 16, "Terry McLaurin": 11,
  },
  "2024-p5": {
    "Jalen Hurts": 17, "Saquon Barkley": 3, "A.J. Brown": 7, "Travis Kelce": 1, "DEF-PHI": 18,
    "DeVonta Smith": 11, "Jake Elliott": 22, "Kareem Hunt": 0, "Harrison Butker": 0,
  },
};

// Where ESPN + the written rules differ from the sheet; the sheet value is in the comment.
const DISPUTED: Record<string, Record<string, number>> = {
  "2024-p1": { "Josh Allen": 14 }, // sheet 15: TD passes of 24 and 55 yds + a 2-pt pass (+1)
  "2024-p2": {
    "DEF-PHI": 9, // sheet 11: 5 sacks, 2 takeaways, 22 allowed
    "Jameson Williams": 13, // sheet 14: a WR who threw an INT; the sheet didn't take a point off
  },
};

function load(round: string): GameStats[] {
  const dir = join(__dirname, "__fixtures__", round);
  return readdirSync(dir).map((f) => parseEspnGame(JSON.parse(readFileSync(join(dir, f), "utf8")) as EspnSummary));
}

for (const round of Object.keys(ROUNDS)) {
  describe(`${round} against the league's playoff sheet`, () => {
    const games = load(round);
    const points = new Map<string, number>();
    for (const g of games) {
      const s = scoreGame(g, RULES_2026);
      for (const p of g.players.values()) points.set(nameKey(p.name), s.get(p.playerId)!);
      for (const team of g.defenses.keys()) points.set(defenseId(team), s.get(defenseId(team))!);
    }

    for (const [name, expected] of Object.entries({ ...ROUNDS[round], ...DISPUTED[round] })) {
      it(`${name} scores ${expected}`, () => {
        expect(points.get(name.startsWith("DEF-") ? name : nameKey(name)) ?? 0).toBe(expected);
      });
    }

    it("has no unrecognized scoring plays", () => {
      expect(games.flatMap((g) => g.warnings).filter((w) => w.startsWith("Unrecognized"))).toEqual([]);
    });
  });
}
