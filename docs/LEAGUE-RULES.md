# Dave FFL — League Rules Spec

Source of truth for the scoring engine, lineup validation and payouts.
Confirmed with the league on 2026-09-28. Every value below is stored as
per-season configuration, not hard-coded.

## League
- 12 owners in 2026 (can change per season). One entry per owner per week.
- Entry fee $10/week. Every owner owes the fee every week, whether or not they submit.
  A non-submitted lineup scores 0.
- Pot = owners × $10 ($120 in 2026).

## Lineup
| Slot | Eligible |
|---|---|
| QB | QB |
| RB1, RB2 | RB |
| WR1, WR2, WR3 | WR or TE |
| K | K |
| DEF | Team defense |

- Validation is enforced on save: a player can only be placed in a slot matching their position.
- Exactly one doubled pick per lineup, on any slot except QB (K and DEF allowed). That player's points × 2.
- Any NFL player may be picked by any owner; duplicate lineups are allowed.
- Each slot locks at that player's own NFL kickoff. The doubled designation locks when its player
  kicks off, and can never be moved onto a player whose game has started.
- All lineups, including partial ones, are visible to every owner as soon as they are saved.

## Scoring
### Passing (QB)
| Event | Pts |
|---|---|
| TD pass 0–24 yds | 4 |
| TD pass 25–49 yds | 6 |
| TD pass 50+ yds | 8 |
| 300+ passing yards | 4 |
| Each completed 25 yds past 300 | 1 |

| Each interception thrown | -1 |

Passing yards under 300 score nothing. Fumbles lost are not penalized. The interception penalty
applies to any player who throws one.

### Rushing and receiving (QB, RB, WR, TE) — scored separately
| Event | Pts |
|---|---|
| TD 0–24 yds | 6 |
| TD 25–49 yds | 9 |
| TD 50+ yds | 12 |
| Each completed 25 rushing yds | 1 |
| Each completed 25 receiving yds | 1 |

Rushing and receiving yards are floored independently: 24 rush + 24 rec = 0 pts.

Distance boundaries: an exact boundary scores the higher tier (a 25-yd TD is 25–49; a 50-yd TD is 50+;
a 45-yd FG is 45+).

### Kick and punt returns (individual player)
Return yards and return TDs count for the returning player, not the team defense. Return yards are a
third separately-floored category (1 pt per completed 25), and a return TD uses the rushing TD tiers.

### Kicker
| Event | Pts |
|---|---|
| FG under 45 yds | 3 |
| FG 45+ yds | 5 |
| XP | 1 |

### Defense
| Event | Pts |
|---|---|
| Turnover (INT or fumble recovery) | 2 each |
| Safety | 4 |
| Sack | 1 each |
| Defensive TD (any length) | 6 |
| Shutout (0 allowed) | 7 total |
| 1–9 allowed | 2 |
| 10–35 allowed | 0 |
| 36–50 allowed | -2 |
| 51+ allowed | -5 |

Points allowed = all points the opponent scored, including TDs by our offense or special teams.
Tiers are not cumulative.

A kick or punt return TD by the opponent counts toward points allowed; it is not a Defensive TD.

### Stat source and edge cases
- Official stats: ESPN's box score and scoring plays for each game; the commissioner can override.
- Lateral touchdowns: the passer and the player who scores both get a TD of the full play length;
  the play is flagged for commissioner review.
- A player who doesn't play scores 0.

### Not scored
Two-point conversions, missed kicks.

## Payouts
| Place | 1 | 2 | 3 | 4 | 5 | 6–12 |
|---|---|---|---|---|---|---|
| Payout | $40 | $28 | $22 | $17 | $13 | $0 |

- Ties: pool the prize money of every place the tied owners occupy and split equally.
  Example: tie for 2nd = (28 + 22) / 2 = $25 each.
- Split shares are exact to the cent, with leftover pennies assigned so payouts always equal the
  pot (2025 wk 13: $10 / 3 = 3.33, 3.33, 3.34; 2025 wk 15: $23 / 3 = 7.66, 7.67, 7.67). This is the
  commissioner's historical method.
- Weekly checksum: pot − total payouts must equal $0.00 before a week can finalize (matches the
  sheet's CHKSUM row).
- Ledger per owner: entry fees owed (−$10/week), winnings, net.

### History
- 2025: 13 owners, $130 pot, six paid places: $40 / 28 / 22 / 17 / 13 / 10.
- The 2025 end-of-season payout page is the playoff contest (see Playoffs).

## Season settlement
- Money is not paid out week by week or separately for regular season vs. playoffs. Each owner's
  running net (weekly winnings + playoff winnings − all fees) is settled once, after the Super Bowl.
- Season cost per owner: $10 × regular-season weeks + the playoff entry.
- The app produces the settle-up list ("Owner A pays Owner B $58.50"), as on the 2025 league sheet.
- 2025 fees per owner: 18 weeks × $10 + $40 playoff entry = $220.

## Playoffs (build after the regular season platform)
One cumulative contest from the Wild Card round through the Super Bowl. Highest total wins.
- Each owner picks 10 players before the Wild Card round: the 8 standard slots
  (QB, RB×2, WR/TE×3, K, DEF) plus 2 reserves.
- Points accumulate across rounds. Dashboard shows each player's points for the current round and
  the running total.
- When a player's team is knocked out, that player is eliminated (shown in red) and scores nothing
  further; points already earned stay.
- Maximum 8 active players at any time; only active players score. Reserves score nothing.
- Reserves can be named or changed at any time.
- After a round is completed (Wild Card, Divisional, Conference Championships), an owner can swap a
  reserve in for any active player, eliminated or not. Swaps lock at the next round's first kickoff.
- The active lineup always keeps the regular-season structure: 1 QB, 2 RB, 3 WR/TE, 1 K, 1 DEF.
  A reserve can only replace a player in a slot it is eligible for. Eliminated players stay in their
  slot (scoring nothing) until swapped out, so a late-round lineup may effectively have no live QB
  or only two live WRs.
- A player's points count only for the rounds in which that player was active on the owner's
  roster; points already earned are never removed.
- One doubled non-QB pick. The doubler can be moved after each completed round; doubling applies to
  points scored in the rounds that player held it.
- Scoring rules are the same as the regular season.
- Entry $40 per owner (2025 and 2026). Pot paid to 8 places as a share of the pot:
  25% / 20% / 16% / 13% / 10% / 8% / 5% / 3%. Ties use the same pooling rule as weekly payouts.

## Weekly timeline
- Provisional scores after Thursday games and after Sunday games.
- Scores and payouts finalized automatically after the Monday night game.
- The commissioner can overturn stats or lineups through Wednesday; every change is logged
  and triggers a recalculation and notification.
- Totals are always computed from the saved lineup rows, never stored separately. Finalization is
  blocked if any player whose game is final has no stat line.

## For the commissioner to confirm (summarize before launch)
- ESPN box score as the official stat source, with commissioner overrides.
- Six 2026 weeks 1–3 scores where ESPN + the written rules differ from the sheet by 1–2 points
  (listed in `src/lib/scoring/espn.test.ts` → DISPUTED). Paid weeks stay as paid.
- Lateral touchdowns scored at the full play length.
- Return yards as their own category.
- The −1 per interception: the app applies it to any passer, but the 2025 playoff sheet didn't dock
  a WR who threw one (Jameson Williams). QBs only?
- 2024–25 playoff disputes (`src/lib/scoring/playoffs-2024.test.ts` → DISPUTED): Josh Allen WC
  (24-yd TD pass scored as 25+?), Eagles DEF divisional (+2 vs ESPN, same pattern as 2026 wk 1 JAX).

## Open questions
- Tie splits: which tied owner(s) receive the leftover penny? (Default: alphabetical by owner ID.)
