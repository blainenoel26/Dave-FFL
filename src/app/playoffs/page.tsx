import { AppHeader } from "@/components/app-header";
import { SLOTS, type Slot } from "@/lib/league/lineup";
import { loadPlayoffs } from "@/lib/playoffs/data";
import { RESERVE_SLOTS } from "@/lib/playoffs/rules";
import { createClient, getCurrentOwner } from "@/lib/supabase/server";
import { RosterEditor, type Matchup } from "./roster-editor";

const SLOT_LABEL: Record<Slot, string> = {
  QB: "QB", RB1: "RB", RB2: "RB", WR1: "WR", WR2: "WR", WR3: "WR", K: "K", DEF: "DEF",
};
const ROUND_SHORT = ["WC", "DIV", "CONF", "SB"];
const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

export default async function PlayoffsPage() {
  const owner = await getCurrentOwner();
  const view = await loadPlayoffs(await createClient());

  if (!view || view.players.length === 0) {
    return (
      <>
        <AppHeader />
        <main className="page">
          <h1 className="text-xl font-semibold">Playoffs</h1>
          <section className="card flex flex-col gap-2 text-sm">
            <p>
              Playoff picks open once the Wild Card matchups are set, right after Week 18. The Wild Card round starts
              January 16.
            </p>
            <p className="text-muted">
              Everyone plays ($40). Pick 8 actives (QB, 2 RB, 3 WR/TE, K, DEF) plus 2 reserves. Points add up from the
              Wild Card round through the Super Bowl; eliminated players stop scoring. Between rounds you can swap a
              reserve in (two swaps in all) and move your x2. Top 8 are paid: 25, 20, 16, 13, 10, 8, 5 and 3% of the
              pot.
            </p>
          </section>
        </main>
      </>
    );
  }

  const byId = new Map(view.players.map((p) => [p.id, p]));
  const eliminated = new Set(view.context.eliminated);
  const matchups: Record<string, Matchup> = {};
  for (const g of view.current?.games ?? []) {
    matchups[g.homeTeam] = { opponent: g.awayTeam, home: true, kickoff: g.kickoff };
    matchups[g.awayTeam] = { opponent: g.homeTeam, home: false, kickoff: g.kickoff };
  }
  const mine = view.standings.find((s) => s.ownerId === owner?.id);
  const name = (id: string | null | undefined) => (id ? (byId.get(id)?.name ?? id) : "—");
  const out = (id: string | null | undefined) => !!id && eliminated.has(byId.get(id)?.team ?? "");

  return (
    <>
      <AppHeader />
      <main className="page pb-28">
        <div>
          <h1 className="text-xl font-semibold">Playoffs</h1>
          <p className="text-sm text-muted">
            {view.current?.label} · {view.context.inProgress ? "round in progress" : "between rounds"} · pot{" "}
            {money(view.potCents)}
          </p>
        </div>

        <section className="card overflow-x-auto">
          <h2 className="mb-2 font-semibold">Standings</h2>
          <table className="w-full text-sm">
            <thead className="text-xs text-muted">
              <tr>
                <th className="py-1 text-left font-normal">#</th>
                <th className="py-1 text-left font-normal">Owner</th>
                {view.rounds.map((r) => (
                  <th key={r.id} className="py-1 text-right font-normal">
                    {ROUND_SHORT[r.number - 1]}
                  </th>
                ))}
                <th className="py-1 text-right font-normal">Total</th>
                <th className="py-1 text-right font-normal">Pays</th>
              </tr>
            </thead>
            <tbody>
              {view.standings.map((s) => (
                <tr key={s.ownerId} className={`border-t border-border ${s.ownerId === owner?.id ? "font-semibold" : ""}`}>
                  <td className="py-1.5 text-muted">{s.place}</td>
                  <td className="py-1.5">{s.ownerName}</td>
                  {s.roundPoints.map((p, i) => (
                    <td key={i} className="py-1.5 text-right tabular-nums">
                      {p}
                    </td>
                  ))}
                  <td className="py-1.5 text-right tabular-nums">{s.total}</td>
                  <td className="py-1.5 text-right tabular-nums text-accent">{s.payoutCents ? money(s.payoutCents) : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {mine && (
          <section>
            <h2 className="text-lg font-semibold">Your roster</h2>
            <p className="text-sm text-muted">
              Each active locks at his first playoff kickoff. Red = eliminated, green = live reserve.
            </p>
            <RosterEditor players={view.players} context={view.context} matchups={matchups} initial={mine.roster} />
          </section>
        )}

        <h2 className="mt-4 text-lg font-semibold">Everyone&apos;s rosters</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {view.standings.map((s) => (
            <section key={s.ownerId} className={`card ${s.ownerId === owner?.id ? "border-accent" : ""}`}>
              <h3 className="mb-2 flex justify-between font-semibold">
                <span>
                  <span className="mr-2 text-xs font-normal text-muted">#{s.place}</span>
                  {s.ownerName}
                </span>
                <span className="tabular-nums">{s.total} pts</span>
              </h3>
              <ul className="text-sm">
                {SLOTS.map((slot) => {
                  const id = s.roster.actives[slot];
                  return (
                    <li key={slot} className="flex gap-2 border-t border-border py-1 first:border-0">
                      <span className="w-8 shrink-0 text-xs text-muted">{SLOT_LABEL[slot]}</span>
                      <span className={out(id) ? "text-danger" : ""}>{name(id)}</span>
                      {s.roster.doubled === slot && <span className="text-xs font-semibold text-accent">x2</span>}
                    </li>
                  );
                })}
                {RESERVE_SLOTS.map((spot) => {
                  const r = s.roster.reserves[spot];
                  return (
                    <li key={spot} className="flex gap-2 border-t border-border py-1">
                      <span className="w-8 shrink-0 text-xs text-muted">{spot}</span>
                      <span className={out(r.playerId) ? "text-danger" : r.used ? "text-muted" : r.playerId ? "text-accent" : "text-muted"}>
                        {name(r.playerId)}
                        {r.used && " (used)"}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      </main>
    </>
  );
}
