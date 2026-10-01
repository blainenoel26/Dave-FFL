import Link from "next/link";
import { AppHeader } from "@/components/app-header";
import { Matchup } from "@/components/matchup";
import { SLOTS, lineupTotal, type Slot } from "@/lib/league/lineup";
import { payoutWeek } from "@/lib/league/payouts";
import { getStoredPoints } from "@/lib/league/finalize";
import { getPlayerOptions, getWeek, getWeekLineups, type PlayerOption } from "@/lib/league/week";
import { getWeekScores, type LiveGame, type WeekScores } from "@/lib/scoring/live";
import { RULES_2026 } from "@/lib/scoring/rules";
import { createClient, getCurrentOwner } from "@/lib/supabase/server";

const SLOT_LABEL: Record<Slot, string> = {
  QB: "QB", RB1: "RB", RB2: "RB", WR1: "WR", WR2: "WR", WR3: "WR", K: "K", DEF: "DEF",
};

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

export default async function LineupsPage(props: PageProps<"/lineups">) {
  const { week: weekParam } = await props.searchParams;
  const owner = await getCurrentOwner();
  const db = await createClient();
  const week = await getWeek(db, typeof weekParam === "string" ? Number(weekParam) : null);
  if (!week) {
    return (
      <>
        <AppHeader />
        <main className="page">
          <p className="card">No week is open yet.</p>
        </main>
      </>
    );
  }

  // Finalized weeks use the stored points (including commissioner corrections); others are live.
  const stored = week.status === "final" || week.status === "closed";
  const [players, lineups, scores, storedPoints] = await Promise.all([
    getPlayerOptions(db, week),
    getWeekLineups(db, week),
    getWeekScores(week.seasonYear, week.number, RULES_2026).catch(() => null),
    stored ? getStoredPoints(db, week.id) : null,
  ]);
  const byId = new Map(players.map((p) => [p.id, p]));
  const points = storedPoints ?? scores?.points ?? new Map<string, number>();
  const gameByTeam = new Map<string, LiveGame>();
  for (const g of scores?.games ?? []) {
    gameByTeam.set(g.homeTeam, g);
    gameByTeam.set(g.awayTeam, g);
  }

  const totals = lineups.map((l) => ({
    ownerId: l.ownerId,
    points: lineupTotal(
      l.picks.map((p) => ({ ...p, position: byId.get(p.playerId)?.position ?? "WR" })),
      Object.fromEntries(points),
    ),
  }));
  const standings = payoutWeek(totals, week.payoutTableCents);
  const placeOf = new Map(standings.map((s) => [s.ownerId, s]));
  const started = stored || (scores?.started ?? false);
  const ordered = started
    ? [...lineups].sort((a, b) => placeOf.get(a.ownerId)!.place - placeOf.get(b.ownerId)!.place)
    : lineups;
  const submitted = lineups.filter((l) => l.picks.length > 0).length;

  return (
    <>
      <AppHeader />
      <main className="page">
        <div>
          <div className="flex items-center gap-3">
            {week.number > 1 && (
              <Link href={`/lineups?week=${week.number - 1}`} aria-label="Previous week" className="px-2 text-muted">
                ◀
              </Link>
            )}
            <h1 className="flex-1 text-xl font-semibold">{week.label} lineups</h1>
            {week.number < 18 && (
              <Link href={`/lineups?week=${week.number + 1}`} aria-label="Next week" className="px-2 text-muted">
                ▶
              </Link>
            )}
          </div>
          <p className="text-sm text-muted">
            {stored ? "Final results" : statusLine(scores)} · {submitted} of {lineups.length} owners have picks in.
          </p>
        </div>

        {started && (
          <section className="card">
            <h2 className="mb-2 font-semibold">
              Standings{" "}
              <span className="text-xs font-normal text-muted">
                {stored ? "final" : scores?.allFinal ? "all games final · awaiting finalization" : "provisional"}
              </span>
            </h2>
            <ol className="text-sm">
              {standings.map((s) => (
                <li
                  key={s.ownerId}
                  className={`flex items-center gap-3 border-t border-border py-1.5 first:border-0 ${
                    s.ownerId === owner?.id ? "font-semibold" : ""
                  }`}
                >
                  <span className="w-6 text-muted">{s.place}</span>
                  <span className="flex-1">{lineups.find((l) => l.ownerId === s.ownerId)?.ownerName}</span>
                  {s.cents > 0 && <span className="text-accent">{money(s.cents)}</span>}
                  <span className="w-10 text-right tabular-nums">{s.points}</span>
                </li>
              ))}
            </ol>
          </section>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          {ordered.map((lineup) => {
            const bySlot = new Map(lineup.picks.map((p) => [p.slot, p]));
            const standing = placeOf.get(lineup.ownerId)!;
            return (
              <section
                key={lineup.ownerId}
                className={`card ${lineup.ownerId === owner?.id ? "border-accent" : ""}`}
              >
                <h2 className="mb-2 flex items-baseline justify-between gap-2 font-semibold">
                  <span>
                    {started && <span className="mr-2 text-xs font-normal text-muted">#{standing.place}</span>}
                    {lineup.ownerName}
                  </span>
                  {started ? (
                    <span className="tabular-nums">{standing.points} pts</span>
                  ) : (
                    <span className="text-xs font-normal text-muted">{lineup.picks.length}/8</span>
                  )}
                </h2>
                <ul className="text-sm">
                  {SLOTS.map((slot) => {
                    const pick = bySlot.get(slot);
                    const player = pick ? byId.get(pick.playerId) : undefined;
                    const base = player ? points.get(player.id) : undefined;
                    const game = player ? gameByTeam.get(player.team) : undefined;
                    return (
                      <li key={slot} className="flex gap-2 border-t border-border py-1.5 first:border-0">
                        <span className="w-8 shrink-0 text-xs text-muted">{SLOT_LABEL[slot]}</span>
                        {player ? (
                          <>
                            <span className="min-w-0 flex-1">
                              <span className="font-medium">{player.name}</span>
                              {pick?.doubled && <span className="ml-1 text-xs font-semibold text-accent">x2</span>}
                              <span className="block text-xs text-muted">
                                {player.team} · <GameStatus player={player} game={game} />
                              </span>
                            </span>
                            {(stored || (game && game.state !== "pre")) && (
                              <span className="shrink-0 tabular-nums">
                                {(base ?? 0) * (pick?.doubled ? 2 : 1)}
                              </span>
                            )}
                          </>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      </main>
    </>
  );
}

function statusLine(scores: WeekScores | null): string {
  if (!scores) return "Live scores are unavailable right now";
  if (scores.allFinal) return "All games final";
  if (scores.started) return "Live · refresh for the latest";
  return "Scores appear once games start";
}

function GameStatus({ player, game }: { player: PlayerOption; game: LiveGame | undefined }) {
  if (!game || game.state === "pre") return <Matchup player={player} />;
  const home = game.homeTeam === player.team;
  const opponent = home ? game.awayTeam : game.homeTeam;
  const us = home ? game.homeScore : game.awayScore;
  const them = home ? game.awayScore : game.homeScore;
  return (
    <span className={game.state === "in" ? "text-accent" : ""}>
      {home ? "vs" : "@"} {opponent} {us}–{them} · {game.detail}
    </span>
  );
}
