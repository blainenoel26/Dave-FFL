# Dave FFL — Build Plan

Replace the email + spreadsheet workflow with a mobile-first web app: owners submit lineups on
their phones, scores update automatically during games, and results, payouts and the season
ledger are published after Monday night. Rules live in [LEAGUE-RULES.md](LEAGUE-RULES.md).

## Stack
| Concern | Choice | Why |
|---|---|---|
| App | Next.js (TypeScript), installable PWA | One codebase for phone and desktop; no app store |
| Hosting | Vercel | Free tier, deploys from GitHub |
| Database + auth | Supabase (Postgres) with email magic links | No passwords for owners; row-level security |
| Scheduled jobs | Vercel Cron (fallback: GitHub Actions) | Stat pulls during games and at finalization |
| Email | Resend | Lineup confirmations, reminders, weekly results |
| Tests | Vitest | Scoring engine golden tests against the league's historical sheets |

## Stats source
The rules need the length of every TD and FG, which season-total feeds don't provide.
- **Primary:** ESPN public scoreboard and game summary endpoints — scoring plays with yardage,
  box scores, live during games.
- **Verification:** nflverse play-by-play, pulled nightly, diffed against ESPN.
- **Override:** commissioner can correct any stat line; overrides are logged and win over feeds.

The ESPN endpoints are unofficial; all feed access sits behind one adapter so the source can be
swapped without touching scoring.

## Data model (core tables)
- `seasons` — year, entry fee, payout table, owner count, scoring config (JSON)
- `owners` — name, email, role (owner / commissioner)
- `weeks` — season, number, status (open → provisional → final → closed)
- `nfl_games` — week, teams, kickoff, status
- `nfl_players` — id, name, position, team (team defenses are rows too)
- `player_week_stats` — raw stat line + scoring plays per player per week, source, updated_at
- `stat_overrides` — commissioner corrections with reason and author
- `lineups` / `lineup_slots` — owner, week, slot, player, is_doubled, locked_at
- `week_results` — computed rank, points, payout per owner (derived, rebuildable)
- `ledger_entries` — fees and winnings per owner per week
- `audit_log` — every commissioner action

Totals and payouts are always derived from lineups + stats, never entered by hand.

## Status
- Done: Next.js 16 + TypeScript + Tailwind scaffold, Vitest; lineup validation/totals and payout
  engine (`src/lib/league/`) with golden tests for 2026 weeks 1–3 and the 2025 penny splits.
- Next: Supabase project + schema, magic-link login, player/schedule import.

## Phases
1. **Foundation** — repo scaffold, Supabase schema + migrations, magic-link login, owner roster,
   nightly import of NFL players and schedule.
2. **Scoring engine** — pure, configurable `scoreWeek()` and `payoutWeek()` functions with golden
   tests: every 2026 week and every 2025 week from the league sheet must reproduce its totals
   and payouts exactly (including the 2025 wk 13 and wk 15 penny splits).
3. **Lineup submission** — phone-first pick screen with position search; slot/position validation;
   per-player kickoff locks enforced server-side; doubled-pick rules; all lineups visible live.
4. **Live dashboard** — stat pulls every 10–15 min during game windows; snapshots after TNF,
   after Sunday night, and final after MNF; weekly standings, lineup drill-down, season ledger.
5. **Finalization + commissioner tools** — auto-finalize after MNF when the checksum passes and no
   final game is missing stats; commissioner overrides through Wednesday with audit trail and
   re-notification; week closes Thursday.
6. **History import + parallel run** — import 2025 and 2026 weeks 1–3; run alongside the sheet for
   two weeks, then cut over.
7. **Season ledger + settle-up** — running net per owner across the season; after the Super Bowl,
   generate the "who pays whom" list.
8. **Playoffs** (needed by mid-January) — 10-pick cumulative contest with eliminations, reserve
   activation between rounds, percentage payouts. Reuses the scoring engine; golden-tested against
   the 2025 playoff sheet.

## Privacy
Owner names and emails never enter the repository or its history. The roster lives in the
database (seeded from a gitignored local file), and committed test fixtures use anonymized owner
IDs (`owner01`…). The mapping to real owners stays local.

## Known pitfalls from the prior attempt
- Lineups were matched to owners by column position and got shuffled. Import and storage key on
  owner identity only.
- A points cell was formatted as currency. Points and dollars are separate typed fields.
- A kicker and defense were accepted in each other's slots. Slot eligibility is validated on save.
