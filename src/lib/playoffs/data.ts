// Server-side loading for the playoff contest: rounds with live game states, points per round,
// eliminations, every owner's roster history, and the standings.
import type { SupabaseClient } from "@supabase/supabase-js";
import { payoutWeek, percentTable } from "../league/payouts";
import { getWeekScores } from "../scoring/live";
import { RULES_2026 } from "../scoring/rules";
import type { PlayoffContextData, PlayoffPlayer } from "./context";
import { eliminatedTeams, emptyRoster, playoffTotal, type PlayoffRoster } from "./rules";
import {
  ESPN_PLAYOFF_WEEK,
  currentRound,
  rosterAt,
  rosterForRound,
  roundInProgress,
  type Round,
  type RosterVersion,
} from "./season";


export interface OwnerStanding {
  ownerId: string;
  ownerName: string;
  roster: PlayoffRoster;
  roundPoints: number[]; // by round number - 1
  total: number;
  place: number;
  payoutCents: number;
}

export interface PlayoffView {
  seasonId: number;
  rounds: (Round & { points: Map<string, number> })[];
  current: Round | undefined;
  players: PlayoffPlayer[];
  context: PlayoffContextData;
  standings: OwnerStanding[];
  potCents: number;
  tableCents: number[];
}

type GameRow = { home_team: string; away_team: string; kickoff: string };

export async function loadPlayoffs(db: SupabaseClient, now = new Date()): Promise<PlayoffView | null> {
  const { data: season } = await db
    .from("seasons")
    .select("*") // playoff_payout_cents arrives with migration 0005
    .order("year", { ascending: false })
    .limit(1)
    .single();
  if (!season) return null;

  const { data: weekRows, error } = await db
    .from("weeks")
    .select("id, number, label, nfl_games(home_team, away_team, kickoff)")
    .eq("season_id", season.id)
    .eq("kind", "playoff")
    .order("number");
  if (error) throw new Error(`weeks: ${error.message}`);

  // Live states and points per round, with commissioner overrides on top.
  const rounds = await Promise.all(
    (weekRows ?? []).map(async (w) => {
      const dbGames = w.nfl_games as GameRow[];
      const scores = dbGames.length
        ? await getWeekScores(season.year, ESPN_PLAYOFF_WEEK[w.number], RULES_2026, 3).catch(() => null)
        : null;
      const live = new Map((scores?.games ?? []).map((g) => [`${g.awayTeam}@${g.homeTeam}`, g]));
      const points = new Map(scores?.points ?? []);
      const { data: overrides } = await db
        .from("stat_overrides")
        .select("player_id, points")
        .eq("week_id", w.id)
        .order("created_at");
      for (const o of overrides ?? []) points.set(o.player_id, Number(o.points));

      return {
        id: w.id,
        number: w.number,
        label: w.label,
        points,
        games: dbGames
          .map((g) => {
            const l = live.get(`${g.away_team}@${g.home_team}`);
            return {
              homeTeam: g.home_team,
              awayTeam: g.away_team,
              kickoff: g.kickoff,
              state: l?.state ?? (new Date(g.kickoff) <= now ? ("in" as const) : ("pre" as const)),
              homeScore: l?.homeScore ?? null,
              awayScore: l?.awayScore ?? null,
            };
          })
          .sort((a, b) => a.kickoff.localeCompare(b.kickoff)),
      };
    }),
  );

  const allGames = rounds.flatMap((r) => r.games);
  const playoffTeams = new Set(allGames.flatMap((g) => [g.homeTeam, g.awayTeam]));
  const eliminated = eliminatedTeams(allGames.map((g) => ({ ...g, final: g.state === "post" })));
  const playedTeams = new Set(
    allGames.filter((g) => g.state !== "pre").flatMap((g) => [g.homeTeam, g.awayTeam]),
  );
  const current = currentRound(rounds);
  const startedThisRound = new Set(
    (current?.games ?? []).filter((g) => g.state !== "pre").flatMap((g) => [g.homeTeam, g.awayTeam]),
  );

  // Players on playoff teams (team defenses included).
  const players: PlayoffPlayer[] = [];
  if (playoffTeams.size) {
    const { data } = await db
      .from("nfl_players")
      .select("id, full_name, position, team_id")
      .eq("active", true)
      .in("team_id", [...playoffTeams]);
    for (const p of data ?? []) players.push({ id: p.id, name: p.full_name, position: p.position, team: p.team_id });
    players.sort((a, b) => a.name.localeCompare(b.name));
  }

  // Everyone in the season plays; standings are cumulative.
  const [{ data: members }, { data: versionRows }] = await Promise.all([
    db.from("season_owners").select("owners(id, display_name)").eq("season_id", season.id),
    db.from("playoff_roster_versions").select("owner_id, roster, saved_at").eq("season_id", season.id),
  ]);
  const owners = (members ?? []).map((m) => m.owners as unknown as { id: string; display_name: string });
  const versionsByOwner = new Map<string, RosterVersion[]>();
  for (const v of versionRows ?? []) {
    const list = versionsByOwner.get(v.owner_id) ?? [];
    list.push({ roster: v.roster as PlayoffRoster, savedAt: v.saved_at });
    versionsByOwner.set(v.owner_id, list);
  }

  const rows = owners.map((o) => {
    const versions = versionsByOwner.get(o.id) ?? [];
    const roundPoints = rounds.map((r) =>
      playoffTotal([{ lineup: rosterForRound(versions, r, now), points: r.points }]),
    );
    return {
      ownerId: o.id,
      ownerName: o.display_name,
      roster: versions.length ? rosterAt(versions, now) : emptyRoster(),
      roundPoints,
      total: roundPoints.reduce((a, b) => a + b, 0),
    };
  });

  // Fixed payouts per place when set (2026: $140/110/80/60/40/30/20); otherwise percentages of the pot.
  const fixed = season.playoff_payout_cents as number[] | null | undefined;
  const tableCents = fixed?.length
    ? fixed.map(Number)
    : percentTable(owners.length * season.playoff_entry_cents, (season.playoff_percents as number[]).map(Number));
  const potCents = tableCents.reduce((a, b) => a + b, 0);
  const placed = new Map(
    payoutWeek(rows.map((r) => ({ ownerId: r.ownerId, points: r.total })), tableCents).map((p) => [p.ownerId, p]),
  );
  const standings = rows
    .map((r) => ({ ...r, place: placed.get(r.ownerId)!.place, payoutCents: placed.get(r.ownerId)!.cents }))
    .sort((a, b) => a.place - b.place || a.ownerName.localeCompare(b.ownerName));

  return {
    seasonId: season.id,
    rounds,
    current,
    players,
    context: {
      playedTeams: [...playedTeams],
      startedThisRound: [...startedThisRound],
      eliminated: [...eliminated],
      inProgress: roundInProgress(current, now),
    },
    standings,
    potCents,
    tableCents,
  };
}
