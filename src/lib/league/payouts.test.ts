import { describe, expect, it } from "vitest";
import { payoutWeek, percentTable, type Standing } from "./payouts";

const TABLE_2026 = [4000, 2800, 2200, 1700, 1300];
const TABLE_2025 = [4000, 2800, 2200, 1700, 1300, 1000];

function standings(points: Record<string, number>): Standing[] {
  return Object.entries(points).map(([ownerId, p]) => ({ ownerId, points: p }));
}

function paid(points: Record<string, number>, table: number[]): Record<string, number> {
  return Object.fromEntries(
    payoutWeek(standings(points), table)
      .filter((p) => p.cents > 0)
      .map((p) => [p.ownerId, p.cents]),
  );
}

// Totals and payouts from the league's 2026 sheet (owners anonymized).
describe("2026 league sheet", () => {
  it("week 1: no ties", () => {
    const week1 = {
      owner01: 97, owner02: 87, owner03: 98, owner04: 0, owner05: 73, owner06: 103,
      owner07: 30, owner08: 107, owner09: 88, owner10: 102, owner11: 134, owner12: 91,
    };
    expect(paid(week1, TABLE_2026)).toEqual({
      owner11: 4000, owner08: 2800, owner06: 2200, owner10: 1700, owner03: 1300,
    });
  });

  it("week 2: two-way tie for 4th splits 4th and 5th", () => {
    const week2 = {
      owner01: 116, owner02: 80, owner03: 105, owner04: 86, owner05: 116, owner06: 111,
      owner07: 103, owner08: 118, owner09: 136, owner10: 138, owner11: 66, owner12: 75,
    };
    expect(paid(week2, TABLE_2026)).toEqual({
      owner10: 4000, owner09: 2800, owner08: 2200, owner01: 1500, owner05: 1500,
    });
  });

  it("week 3: four-way tie for 2nd splits 2nd through 5th", () => {
    const week3 = {
      owner01: 103, owner02: 105, owner03: 116, owner04: 108, owner05: 111, owner06: 116,
      owner07: 74, owner08: 116, owner09: 118, owner10: 101, owner11: 116, owner12: 99,
    };
    expect(paid(week3, TABLE_2026)).toEqual({
      owner09: 4000, owner03: 2000, owner06: 2000, owner08: 2000, owner11: 2000,
    });
  });
});

describe("payoutWeek", () => {
  const filler = { f1: 200, f2: 190, f3: 180, f4: 170, f5: 160 };

  it("splits an uneven pool to the cent (2025 week 13: $10 three ways)", () => {
    const result = payoutWeek(standings({ ...filler, a: 100, b: 100, c: 100, z: 50 }), TABLE_2025);
    const tied = result.filter((p) => ["a", "b", "c"].includes(p.ownerId)).map((p) => p.cents);
    expect(tied.sort()).toEqual([333, 333, 334]);
  });

  it("splits across paid and unpaid places (2025 week 15: $23 three ways)", () => {
    const four = { f1: 200, f2: 190, f3: 180, f4: 170 };
    const result = payoutWeek(standings({ ...four, a: 100, b: 100, c: 100, z: 50 }), TABLE_2025);
    const tied = result.filter((p) => ["a", "b", "c"].includes(p.ownerId)).map((p) => p.cents);
    expect(tied.sort()).toEqual([766, 767, 767]);
  });

  it("always pays out exactly the table total", () => {
    const result = payoutWeek(standings({ a: 5, b: 5, c: 5, d: 5, e: 5, f: 5, g: 5 }), TABLE_2025);
    expect(result.reduce((sum, p) => sum + p.cents, 0)).toBe(13000);
  });

  it("gives tied owners the same place", () => {
    const result = payoutWeek(standings({ a: 10, b: 10, c: 5 }), TABLE_2026);
    expect(result.map((p) => p.place)).toEqual([1, 1, 3]);
  });
});

describe("percentTable", () => {
  it("matches the 2025 playoff table for a $520 pot", () => {
    expect(percentTable(52000, [25, 20, 16, 13, 10, 8, 5, 3])).toEqual([
      13000, 10400, 8320, 6760, 5200, 4160, 2600, 1560,
    ]);
  });
});
