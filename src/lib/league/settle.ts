// End-of-season settle-up: turns each owner's net balance into "A pays B" transfers.
// See docs/LEAGUE-RULES.md → Season settlement. Money is integer cents.

export interface Balance {
  ownerId: string;
  cents: number; // positive = owed money, negative = owes money
}

export interface Transfer {
  from: string;
  to: string;
  cents: number;
}

/**
 * Greedy matching: the biggest debtor pays the biggest creditor until one is square. Produces at
 * most (owners − 1) transfers. Balances must sum to zero (fees in = winnings out).
 */
export function settleUp(balances: readonly Balance[]): Transfer[] {
  const total = balances.reduce((sum, b) => sum + b.cents, 0);
  if (total !== 0) throw new Error(`Balances must sum to zero (off by ${total} cents)`);

  const byOwner = (a: Balance, b: Balance) => a.ownerId.localeCompare(b.ownerId);
  const creditors = balances.filter((b) => b.cents > 0).map((b) => ({ ...b })).sort((a, b) => b.cents - a.cents || byOwner(a, b));
  const debtors = balances.filter((b) => b.cents < 0).map((b) => ({ ...b, cents: -b.cents })).sort((a, b) => b.cents - a.cents || byOwner(a, b));

  const transfers: Transfer[] = [];
  let c = 0;
  let d = 0;
  while (c < creditors.length && d < debtors.length) {
    const amount = Math.min(creditors[c].cents, debtors[d].cents);
    transfers.push({ from: debtors[d].ownerId, to: creditors[c].ownerId, cents: amount });
    creditors[c].cents -= amount;
    debtors[d].cents -= amount;
    if (creditors[c].cents === 0) c++;
    if (debtors[d].cents === 0) d++;
  }
  return transfers;
}
