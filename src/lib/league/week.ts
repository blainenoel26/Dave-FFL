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
  /** The picks the viewer may see: their own, and others' once that player has kicked off. */
  picks: SavedPick[];
  /** Every slot the owner has filled, including picks still hidden from the viewer. */
  filledSlots: Slot[];
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

/** All regular-season weeks with their games, in order. */
export async function getWeeks(db: SupabaseClient): Promise<Week[]> {
  const { data, error } = await db
    .from("weeks")
    .select(
      "id, number, label, status, seasons(year, payout_table_cents), nfl_games(id, home_team, away_team, kickoff, status)",
    )
    .eq("kind", "regular")
    .order("number");
  if (error) throw new Error(`weeks: ${error.message}`);

  return (data ?? []).map((w) => {
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
}

/** The current regular-season week: the first whose last game kicked off < 12 hours ago or later. */
export async function getCurrentWeek(db: SupabaseClient, now: Date = new Date()): Promise<Week | null> {
  const weeks = await getWeeks(db);
  if (!weeks.length) return null;
  return (
    weeks.find((w) => {
      const last = w.games[w.games.length - 1];
      return last && new Date(last.kickoff).getTime() + WEEK_ROLLOVER_MS > now.getTime();
    }) ?? weeks[weeks.length - 1]
  );
}

/** A specific week by number, or the current week when no number is given. */
export async function getWeek(db: SupabaseClient, number: number | null): Promise<Week | null> {
  if (number === null) return getCurrentWeek(db);
  return (await getWeeks(db)).find((w) => w.number === number) ?? null;
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

/**
 * Every owner's lineup for the week (owners without one get an empty lineup).
 *
 * Pass the viewer's owner ID (or null when signed out) to hide other owners' picks until that
 * player's game kicks off; filledSlots still says which slots are filled. Omit it for server jobs
 * and the commissioner's fix-a-lineup screen. (Migration 0006 adds the same rule in the database.)
 */
export async function getWeekLineups(
  db: SupabaseClient,
  week: Week,
  viewerId?: string | null,
  now: Date = new Date(),
): Promise<OwnerLineup[]> {
  const [{ data: owners, error: ownersError }, { data: lineups, error: lineupsError }, filled] = await Promise.all([
    db.from("owners").select("id, display_name, owner_code").order("owner_code"),
    db.from("lineups").select("owner_id, lineup_picks(slot, player_id, is_doubled)").eq("week_id", week.id),
    db.rpc("week_filled_slots", { p_week_id: week.id }),
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

  // Before migration 0006 the function doesn't exist; then every pick comes back from the query.
  const filledByOwner = new Map<string, Slot[]>();
  if (!filled.error) {
    for (const row of (filled.data ?? []) as { owner_id: string; slot: Slot }[]) {
      filledByOwner.set(row.owner_id, [...(filledByOwner.get(row.owner_id) ?? []), row.slot]);
    }
  }

  // Kickoff for each picked player, so other owners' unstarted picks can be hidden.
  let kickoffOf = (_playerId: string): string | null => null;
  if (viewerId !== undefined) {
    const ids = [...new Set([...picksByOwner.values()].flat().map((p) => p.playerId))];
    const { data: teams } = ids.length
      ? await db.from("nfl_players").select("id, team_id").in("id", ids)
      : { data: [] as { id: string; team_id: string }[] };
    const teamOf = new Map((teams ?? []).map((t) => [t.id, t.team_id as string]));
    const kickoffByTeam = new Map<string, string>();
    for (const g of week.games) {
      kickoffByTeam.set(g.homeTeam, g.kickoff);
      kickoffByTeam.set(g.awayTeam, g.kickoff);
    }
    kickoffOf = (playerId) => kickoffByTeam.get(teamOf.get(playerId) ?? "") ?? null;
  }

  return (owners ?? []).map((o) => {
    const all = picksByOwner.get(o.id) ?? [];
    const hideFromViewer = viewerId !== undefined && o.id !== viewerId;
    const picks = hideFromViewer
      ? all.filter((p) => {
          const kickoff = kickoffOf(p.playerId);
          return kickoff !== null && new Date(kickoff) <= now;
        })
      : all;
    return {
      ownerId: o.id,
      ownerName: o.display_name,
      picks,
      filledSlots: filled.error ? all.map((p) => p.slot) : (filledByOwner.get(o.id) ?? []),
    };
  });
}

export function isLocked(kickoff: string | null, now: Date = new Date()): boolean {
  return kickoff !== null && new Date(kickoff) <= now;
}
