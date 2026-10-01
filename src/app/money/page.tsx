import { AppHeader } from "@/components/app-header";
import { settleUp } from "@/lib/league/settle";
import { createClient, getCurrentOwner } from "@/lib/supabase/server";

const money = (cents: number) => `${cents < 0 ? "−" : ""}$${(Math.abs(cents) / 100).toFixed(2)}`;

export default async function MoneyPage() {
  const owner = await getCurrentOwner();
  const db = await createClient();

  const [{ data: owners }, { data: entries }] = await Promise.all([
    db.from("owners").select("id, display_name").order("display_name"),
    db.from("ledger_entries").select("owner_id, kind, cents, week_id"),
  ]);

  const rows = (owners ?? []).map((o) => {
    const mine = (entries ?? []).filter((e) => e.owner_id === o.id);
    const fees = mine.filter((e) => e.kind === "fee").reduce((sum, e) => sum + e.cents, 0);
    const winnings = mine.filter((e) => e.kind === "winnings").reduce((sum, e) => sum + e.cents, 0);
    const adjustments = mine.filter((e) => e.kind === "adjustment").reduce((sum, e) => sum + e.cents, 0);
    return {
      ownerId: o.id,
      name: o.display_name,
      weeks: new Set(mine.filter((e) => e.kind === "fee").map((e) => e.week_id)).size,
      fees,
      winnings,
      net: fees + winnings + adjustments,
    };
  });
  rows.sort((a, b) => b.net - a.net || a.name.localeCompare(b.name));

  const nameOf = new Map(rows.map((r) => [r.ownerId, r.name]));
  let transfers: ReturnType<typeof settleUp> = [];
  let settleError: string | null = null;
  try {
    transfers = settleUp(rows.map((r) => ({ ownerId: r.ownerId, cents: r.net })));
  } catch (e) {
    settleError = (e as Error).message;
  }
  const me = rows.find((r) => r.ownerId === owner?.id);
  const hasEntries = (entries ?? []).length > 0;

  return (
    <>
      <AppHeader />
      <main className="page">
        <div>
          <h1 className="text-xl font-semibold">Season money</h1>
          <p className="text-sm text-muted">
            Nothing is paid week to week. Everyone settles up once, after the Super Bowl. Weeks appear here once
            they&apos;re finalized.
          </p>
        </div>

        {me && hasEntries && (
          <section className="card grid grid-cols-3 gap-2 text-center">
            <div>
              <p className="text-xs text-muted">Fees</p>
              <p className="font-semibold tabular-nums">{money(me.fees)}</p>
            </div>
            <div>
              <p className="text-xs text-muted">Winnings</p>
              <p className="font-semibold tabular-nums">{money(me.winnings)}</p>
            </div>
            <div>
              <p className="text-xs text-muted">Your net</p>
              <p className={`font-semibold tabular-nums ${me.net < 0 ? "text-danger" : "text-accent"}`}>
                {money(me.net)}
              </p>
            </div>
          </section>
        )}

        {!hasEntries ? (
          <p className="card text-sm text-muted">
            No weeks have been finalized in the app yet. Week 4 will appear after Monday night.
          </p>
        ) : (
          <>
            <section className="card overflow-x-auto">
              <h2 className="mb-2 font-semibold">Standings by net</h2>
              <table className="w-full text-sm">
                <thead className="text-xs text-muted">
                  <tr>
                    <th className="py-1 text-left font-normal">Owner</th>
                    <th className="py-1 text-right font-normal">Weeks</th>
                    <th className="py-1 text-right font-normal">Fees</th>
                    <th className="py-1 text-right font-normal">Won</th>
                    <th className="py-1 text-right font-normal">Net</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr
                      key={r.ownerId}
                      className={`border-t border-border ${r.ownerId === owner?.id ? "font-semibold" : ""}`}
                    >
                      <td className="py-1.5">{r.name}</td>
                      <td className="py-1.5 text-right tabular-nums">{r.weeks}</td>
                      <td className="py-1.5 text-right tabular-nums">{money(r.fees)}</td>
                      <td className="py-1.5 text-right tabular-nums">{money(r.winnings)}</td>
                      <td className={`py-1.5 text-right tabular-nums ${r.net < 0 ? "text-danger" : "text-accent"}`}>
                        {money(r.net)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            <section className="card">
              <h2 className="font-semibold">If the season ended today</h2>
              <p className="mb-2 text-sm text-muted">The fewest payments that square everyone up.</p>
              {settleError ? (
                <p className="text-sm text-danger">
                  The ledger doesn&apos;t balance ({settleError}). Ask the commissioner to check it.
                </p>
              ) : transfers.length === 0 ? (
                <p className="text-sm text-muted">Everyone is square.</p>
              ) : (
                <ul className="text-sm">
                  {transfers.map((t) => (
                    <li
                      key={`${t.from}-${t.to}`}
                      className={`border-t border-border py-1.5 first:border-0 ${
                        t.from === owner?.id || t.to === owner?.id ? "font-semibold" : ""
                      }`}
                    >
                      {nameOf.get(t.from)} pays {nameOf.get(t.to)} <span className="tabular-nums">{money(t.cents)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </main>
    </>
  );
}
