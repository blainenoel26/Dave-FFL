import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { defenseId, nameKey, parseEspnGame, scoreGame, type EspnSummary, type GameStats } from "./espn";
import { RULES_2026 } from "./rules";

function loadWeek(dir: string): GameStats[] {
  const path = join(__dirname, "__fixtures__", dir);
  return readdirSync(path).map((file) =>
    parseEspnGame(JSON.parse(readFileSync(join(path, file), "utf8")) as EspnSummary),
  );
}

/** Points by player name key (or DEF-<team>); players who didn't play are absent and score 0. */
function pointsByName(games: GameStats[]): Map<string, number> {
  const result = new Map<string, number>();
  for (const game of games) {
    const points = scoreGame(game, RULES_2026);
    for (const p of game.players.values()) result.set(nameKey(p.name), points.get(p.playerId)!);
    for (const team of game.defenses.keys()) result.set(defenseId(team), points.get(defenseId(team))!);
  }
  return result;
}

const keyFor = (name: string) => (name.startsWith("DEF-") ? name : nameKey(name));

// Every player/defense picked each week, with the points on the league sheet.
const SHEET: Record<string, Record<string, number>> = {
  "2026-w1": {
    "Lamar Jackson": 19, "Joe Burrow": 3, "Josh Allen": 29, "Dak Prescott": 7,
    "Jahmyr Gibbs": 19, "Bijan Robinson": 12, "Derrick Henry": 26, "Saquon Barkley": 3,
    "De'Von Achane": 2, "Jaxon Smith-Njigba": 13, "Puka Nacua": 2, "Ja'Marr Chase": 0,
    "Amon-Ra St. Brown": 14, "CeeDee Lamb": 7,
    "Brandon Aubrey": 2, "Cameron Dicker": 2, "Harrison Butker": 7,
    "DEF-TEN": 0, "DEF-PIT": 14, "DEF-LAC": 1, "DEF-PHI": 1,
  },
  "2026-w2": {
    "Josh Allen": 28, "Lamar Jackson": 4, "Jahmyr Gibbs": 10, "Christian McCaffrey": 13,
    "Kenneth Walker III": 6, "Bijan Robinson": 2, "D'Andre Swift": 3,
    "Justin Jefferson": 2, "Puka Nacua": 0, "Amon-Ra St. Brown": 20, "Ja'Marr Chase": 18,
    "CeeDee Lamb": 18, "DeVonta Smith": 10, "Malik Nabers": 0,
    "Harrison Butker": 17, "Cam Little": 7, "Brandon Aubrey": 15, "Evan McPherson": 12,
    "Ka'imi Fairbairn": 8,
    "DEF-PHI": 2, "DEF-SF": 4, "DEF-TB": 2, "DEF-BAL": 3, "DEF-PIT": 7,
  },
  "2026-w3": {
    "Josh Allen": 10, "Derrick Henry": 15, "Jahmyr Gibbs": 23, "Christian McCaffrey": 10,
    "Jaxon Smith-Njigba": 17, "Amon-Ra St. Brown": 6, "Ja'Marr Chase": 9, "Chris Olave": 4,
    "George Kittle": 15, "Harrison Butker": 6, "Cam Little": 5,
    "Brandon Aubrey": 11, "Evan McPherson": 11, "Eddy Pineiro": 8,
    "DEF-SEA": 2, "DEF-KC": 4,
  },
};

// Where the ESPN box score and the league sheet disagree. Values here are what the rules give from
// ESPN's stats; the sheet value is in the comment. Pending a ruling by the league.
const DISPUTED: Record<string, Record<string, number>> = {
  "2026-w1": {
    "DEF-JAX": 9, // sheet 11: 5 sacks, 2 takeaways, 10 allowed
    "Justin Jefferson": 20, // sheet 18: the sheet didn't count his 2-point catch (+2)
  },
  "2026-w2": {
    "Derrick Henry": 8, // sheet 6: 68 rush yds, 19 rec yds, 1-yd rush TD
    "Jaxon Smith-Njigba": 30, // sheet 31: 155 rec yds, TDs of 82, 7, 12
  },
  "2026-w3": {
    "Kenneth Walker III": 14, // sheet 15: 70 rush, 3 rec, 10-yd rush TD, 5-yd rec TD
    "Ashton Jeanty": 3, // sheet 2: 56 rush, 37 rec
    "DEF-CAR": 4, // sheet 2: 2 sacks, 1 takeaway, 21 allowed
    "CeeDee Lamb": 6, // sheet 4: the sheet didn't count his 2-point catch (+2)
  },
};

for (const week of Object.keys(SHEET)) {
  describe(`${week} against the league sheet`, () => {
    const points = pointsByName(loadWeek(week));

    for (const [name, expected] of Object.entries({ ...SHEET[week], ...DISPUTED[week] })) {
      it(`${name} scores ${expected}`, () => {
        expect(points.get(keyFor(name)) ?? 0).toBe(expected);
      });
    }
  });
}

describe("scoring-play parsing", () => {
  const warnings = ["2026-w1", "2026-w2", "2026-w3"].flatMap((w) => loadWeek(w).flatMap((g) => g.warnings));

  it("flags only lateral touchdowns for review", () => {
    expect(warnings.filter((w) => !w.startsWith("Lateral touchdown"))).toEqual([]);
  });

  it("scores a lateral TD by the full play length", () => {
    expect(warnings).toContainEqual(expect.stringContaining("82-yard pass and catch"));
  });
});
