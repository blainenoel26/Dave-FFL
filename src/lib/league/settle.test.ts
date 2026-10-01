import { describe, expect, it } from "vitest";
import { settleUp, type Balance } from "./settle";

const net = (transfers: ReturnType<typeof settleUp>, owner: string) =>
  transfers.reduce((sum, t) => sum + (t.to === owner ? t.cents : 0) - (t.from === owner ? t.cents : 0), 0);

describe("settleUp", () => {
  it("squares every owner's balance", () => {
    const balances: Balance[] = [
      { ownerId: "a", cents: 11350 },
      { ownerId: "b", cents: 5850 },
      { ownerId: "c", cents: -12540 },
      { ownerId: "d", cents: -5300 },
      { ownerId: "e", cents: 640 },
      { ownerId: "f", cents: 0 },
    ];
    const transfers = settleUp(balances);
    for (const b of balances) expect(net(transfers, b.ownerId)).toBe(b.cents);
    expect(transfers.length).toBeLessThanOrEqual(balances.length - 1);
    expect(transfers.every((t) => t.cents > 0)).toBe(true);
  });

  it("has the biggest debtor pay the biggest creditor first", () => {
    const transfers = settleUp([
      { ownerId: "winner", cents: 3000 },
      { ownerId: "small", cents: -1000 },
      { ownerId: "big", cents: -2000 },
    ]);
    expect(transfers[0]).toEqual({ from: "big", to: "winner", cents: 2000 });
  });

  it("needs no transfers when everyone is square", () => {
    expect(settleUp([{ ownerId: "a", cents: 0 }, { ownerId: "b", cents: 0 }])).toEqual([]);
  });

  it("rejects balances that don't sum to zero", () => {
    expect(() => settleUp([{ ownerId: "a", cents: 100 }])).toThrow("sum to zero");
  });
});
