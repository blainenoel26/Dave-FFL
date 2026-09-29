// Weekly and playoff payouts. See docs/LEAGUE-RULES.md → Payouts.
// All money is integer cents.

export interface Standing {
  ownerId: string;
  points: number;
}

export interface Payout extends Standing {
  /** Finishing place; tied owners share the highest place of their group. */
  place: number;
  cents: number;
}

/**
 * Ranks owners and splits the payout table. Tied owners pool the prizes of every place they
 * occupy and split it equally to the cent; leftover pennies go one each to the tied owners in
 * owner-ID order, so payouts always sum to the table total.
 */
export function payoutWeek(standings: readonly Standing[], tableCents: readonly number[]): Payout[] {
  const ranked = [...standings].sort(
    (a, b) => b.points - a.points || a.ownerId.localeCompare(b.ownerId),
  );

  const result: Payout[] = [];
  let i = 0;
  while (i < ranked.length) {
    let j = i;
    while (j < ranked.length && ranked[j].points === ranked[i].points) j++;

    const group = ranked.slice(i, j);
    let pool = 0;
    for (let place = i; place < j; place++) pool += tableCents[place] ?? 0;

    const share = Math.floor(pool / group.length);
    let remainder = pool - share * group.length;
    for (const owner of group) {
      const extra = remainder > 0 ? 1 : 0;
      remainder -= extra;
      result.push({ ...owner, place: i + 1, cents: share + extra });
    }
    i = j;
  }
  return result;
}

/** Builds a payout table from a pot and percentages (playoffs). Rounding drift goes to 1st place. */
export function percentTable(potCents: number, percents: readonly number[]): number[] {
  const table = percents.map((pct) => Math.round((potCents * pct) / 100));
  const drift = Math.round((potCents * percents.reduce((a, b) => a + b, 0)) / 100) -
    table.reduce((a, b) => a + b, 0);
  if (table.length > 0) table[0] += drift;
  return table;
}
