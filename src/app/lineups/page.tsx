import { AppHeader } from "@/components/app-header";
import { Matchup } from "@/components/matchup";
import { SLOTS, type Slot } from "@/lib/league/lineup";
import { getCurrentWeek, getPlayerOptions, getWeekLineups } from "@/lib/league/week";
import { createClient, getCurrentOwner } from "@/lib/supabase/server";

const SLOT_LABEL: Record<Slot, string> = {
  QB: "QB", RB1: "RB", RB2: "RB", WR1: "WR", WR2: "WR", WR3: "WR", K: "K", DEF: "DEF",
};

export default async function LineupsPage() {
  const owner = await getCurrentOwner();
  const db = await createClient();
  const week = await getCurrentWeek(db);
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

  const [players, lineups] = await Promise.all([getPlayerOptions(db, week), getWeekLineups(db, week)]);
  const byId = new Map(players.map((p) => [p.id, p]));
  const submitted = lineups.filter((l) => l.picks.length > 0).length;

  return (
    <>
      <AppHeader />
      <main className="page">
        <h1 className="text-xl font-semibold">{week.label} lineups</h1>
        <p className="text-sm text-muted">
          {submitted} of {lineups.length} owners have picks in. Scores appear here once games start.
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {lineups.map((lineup) => {
            const bySlot = new Map(lineup.picks.map((p) => [p.slot, p]));
            return (
              <section
                key={lineup.ownerId}
                className={`card ${lineup.ownerId === owner?.id ? "border-accent" : ""}`}
              >
                <h2 className="mb-2 flex items-baseline justify-between font-semibold">
                  {lineup.ownerName}
                  <span className="text-xs font-normal text-muted">{lineup.picks.length}/8</span>
                </h2>
                <ul className="text-sm">
                  {SLOTS.map((slot) => {
                    const pick = bySlot.get(slot);
                    const player = pick ? byId.get(pick.playerId) : undefined;
                    return (
                      <li key={slot} className="flex gap-2 border-t border-border py-1.5 first:border-0">
                        <span className="w-8 shrink-0 text-xs text-muted">{SLOT_LABEL[slot]}</span>
                        {player ? (
                          <span className="min-w-0 flex-1">
                            <span className="font-medium">{player.name}</span>
                            {pick?.doubled && <span className="ml-1 text-xs font-semibold text-accent">x2</span>}
                            <span className="block text-xs text-muted">
                              {player.team} · <Matchup player={player} />
                            </span>
                          </span>
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
