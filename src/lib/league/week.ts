// Server-side loaders for the current week, players and lineups. Reads run as the signed-in
// owner, so row-level security applies.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Position, Slot } from "./lineup";

export interface Game {
  id: string;
  homeTeam: string;
  awayTeam: string;
  kickoff: string; // ISO
  status: "scheduled" | "in_progress" | "final";
}

export interface Week {
  id: number;
  number: number;
  label: string;
  status: string;
  seasonYear: number;
  payoutTableCents: number[];
  games: Game[];
}

export interface PlayerOption {
  id: string;
  name: string;
  position: Position;
  team: string;
  /** This week's game for the player's team, or null on a bye. */
  gameId: string | null;
  opponent: string | null;
  home: boolean;
  kickoff: string | null;
}

export interface SavedPick {
  slot: Slot;
  playerId: string;
  doubled: boolean;
}

export interface OwnerLineup {
  ownerId: string;
  ownerName: string;
  picks: SavedPick[];
}

type GameRow = {
  id: string;
  home_team: string;
  away_team: string;
  kickoff: string;
  status: Game["status"];
};

function toGame(g: GameRow): Game {
  return { id: g.id, homeTeam: g.home_team, awayTeam: g.away_team, kickoff: g.kickoff, status: g.status };
}

/** A week stays current until this long after its last kickoff (Monday night → Tuesday morning). */
const WEEK_ROLLOVER_MS = 12 * 60 * 60 * 1000;

/** The current regular-season week: the first whose last game kicked off < 12 hours ago or later. */
export async function getCurrentWeek(db: SupabaseClient, now: Date = new Date()): Promise<Week | null> {
  const { data, error } = await db
    .from("weeks")
    .select(
      "id, number, label, status, seasons(year, payout_table_cents), nfl_games(id, home_team, away_team, kickoff, status)",
    )
    .eq("kind", "regular")
    .order("number");
  if (error) throw new Error(`weeks: ${error.message}`);
  if (!data?.length) return null;

  const weeks: Week[] = data.map((w) => {
    const season = w.seasons as unknown as { year: number; payout_table_cents: number[] };
    return {
      id: w.id,
      number: w.number,
      label: w.label,
      status: w.status,
      seasonYear: season.year,
      payoutTableCents: season.payout_table_cents,
      games: (w.nfl_games as GameRow[]).map(toGame).sort((a, b) => a.kickoff.localeCompare(b.kickoff)),
    };
  });
  return (
    weeks.find((w) => {
      const last = w.games[w.games.length - 1];
      return last && new Date(last.kickoff).getTime() + WEEK_ROLLOVER_MS > now.getTime();
    }) ?? weeks[weeks.length - 1]
  );
}

/** Active players plus team defenses, with this week's matchup for each. */
export async function getPlayerOptions(db: SupabaseClient, week: Week): Promise<PlayerOption[]> {
  const rows: { id: string; full_name: string; position: Position; team_id: string }[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await db
      .from("nfl_players")
      .select("id, full_name, position, team_id")
      .eq("active", true)
      .order("id")
      .range(from, from + pageSize - 1);
    if (error) throw new Error(`nfl_players: ${error.message}`);
    rows.push(...data);
    if (data.length < pageSize) break;
  }

  const gameByTeam = new Map<string, Game>();
  for (const g of week.games) {
    gameByTeam.set(g.homeTeam, g);
    gameByTeam.set(g.awayTeam, g);
  }

  return rows
    .map((p) => {
      const game = gameByTeam.get(p.team_id) ?? null;
      const home = game?.homeTeam === p.team_id;
      return {
        id: p.id,
        name: p.full_name,
        position: p.position,
        team: p.team_id,
        gameId: game?.id ?? null,
        opponent: game ? (home ? game.awayTeam : game.homeTeam) : null,
        home,
        kickoff: game?.kickoff ?? null,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Every owner's lineup for the week (owners without one get an empty lineup). */
export async function getWeekLineups(db: SupabaseClient, week: Week): Promise<OwnerLineup[]> {
  const [{ data: owners, error: ownersError }, { data: lineups, error: lineupsError }] = await Promise.all([
    db.from("owners").select("id, display_name, owner_code").order("owner_code"),
    db.from("lineups").select("owner_id, lineup_picks(slot, player_id, is_doubled)").eq("week_id", week.id),
  ]);
  if (ownersError) throw new Error(`owners: ${ownersError.message}`);
  if (lineupsError) throw new Error(`lineups: ${lineupsError.message}`);

  const picksByOwner = new Map(
    (lineups ?? []).map((l) => [
      l.owner_id as string,
      (l.lineup_picks as { slot: Slot; player_id: string; is_doubled: boolean }[]).map((p) => ({
        slot: p.slot,
        playerId: p.player_id,
        doubled: p.is_doubled,
      })),
    ]),
  );

  return (owners ?? []).map((o) => ({
    ownerId: o.id,
    ownerName: o.display_name,
    picks: picksByOwner.get(o.id) ?? [],
  }));
}

export function isLocked(kickoff: string | null, now: Date = new Date()): boolean {
  return kickoff !== null && new Date(kickoff) <= now;
}
