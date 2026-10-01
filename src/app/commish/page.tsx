import Link from "next/link";
import { AppHeader } from "@/components/app-header";
import { getStoredPoints } from "@/lib/league/finalize";
import { getPlayerOptions, getWeek, getWeekLineups } from "@/lib/league/week";
import { getWeekScores } from "@/lib/scoring/live";
import { RULES_2026 } from "@/lib/scoring/rules";
import { createClient, getCurrentOwner } from "@/lib/supabase/server";
import { emailConfigured } from "@/lib/email/send";
import { finalizeAction, overrideAction, testEmailAction } from "./actions";

const STATUS_TEXT: Record<string, string> = {
  open: "Open: games are being played or haven't started.",
  provisional: "Open: games are being played.",
  final: "Finalized. Corrections are allowed until the week closes early Thursday.",
  closed: "Closed. No more changes.",
};

export default async function CommishPage(props: PageProps<"/commish">) {
  const { week: weekParam, msg } = await props.searchParams;
  const owner = await getCurrentOwner();
  if (owner?.role !== "commissioner") {
    return (
      <>
        <AppHeader />
        <main className="page">
          <p className="card">This page is for the commissioner.</p>
        </main>
      </>
    );
  }

  const db = await createClient();
  const week = await getWeek(db, typeof weekParam === "string" ? Number(weekParam) : null);
  if (!week) return null;

  const [players, lineups, scores, stored, overrides] = await Promise.all([
    getPlayerOptions(db, week),
    getWeekLineups(db, week),
    getWeekScores(week.seasonYear, week.number, RULES_2026).catch(() => null),
    week.status === "final" || week.status === "closed" ? getStoredPoints(db, week.id) : null,
    db
      .from("stat_overrides")
      .select("id, player_id, points, reason")
      .eq("week_id", week.id)
      .order("created_at", { ascending: false })
      .then(({ data }) => data ?? []),
  ]);
  const byId = new Map(players.map((p) => [p.id, p]));
  const points = stored ?? scores?.points ?? new Map<string, number>();
  const picked = [...new Set(lineups.flatMap((l) => l.picks.map((p) => p.playerId)))]
    .map((id) => byId.get(id))
    .filter((p) => p !== undefined)
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <>
      <AppHeader />
      <main className="page">
        <div className="flex items-center gap-3">
          {week.number > 1 && (
            <Link href={`/commish?week=${week.number - 1}`} aria-label="Previous week" className="px-2 text-muted">
              ◀
            </Link>
          )}
          <h1 className="flex-1 text-xl font-semibold">Commissioner · {week.label}</h1>
          {week.number < 18 && (
            <Link href={`/commish?week=${week.number + 1}`} aria-label="Next week" className="px-2 text-muted">
              ▶
            </Link>
          )}
        </div>

        {typeof msg === "string" && <p className="card border-accent text-sm">{msg}</p>}

        <section className="card flex flex-col gap-3">
          <h2 className="font-semibold">Finalize</h2>
          <p className="text-sm text-muted">{STATUS_TEXT[week.status] ?? week.status}</p>
          <p className="text-sm text-muted">
            The app finalizes automatically early each morning once every game is final. Use this button to publish
            results right after Monday night.
          </p>
          {week.status !== "closed" && (
            <form action={finalizeAction}>
              <input type="hidden" name="weekId" value={week.id} />
              <input type="hidden" name="weekNumber" value={week.number} />
              <button className="btn-primary" disabled={!scores?.allFinal}>
                {week.status === "final" ? "Re-run finalization" : "Finalize now"}
              </button>
              {!scores?.allFinal && <p className="mt-2 text-xs text-muted">Available once every game is final.</p>}
            </form>
          )}
        </section>

        <section className="card flex flex-col gap-3">
          <h2 className="font-semibold">Email</h2>
          <p className="text-sm text-muted">
            {emailConfigured()
              ? "League email is connected. Owners get pick reminders (Thu and Sun at noon ET) and a results email when a week is finalized."
              : "League email isn't connected yet, so no reminders or results emails go out."}
          </p>
          {emailConfigured() && (
            <form action={testEmailAction}>
              <input type="hidden" name="weekNumber" value={week.number} />
              <button className="flex h-12 w-full items-center justify-center rounded-lg border border-border font-medium">
                Send me a test email
              </button>
            </form>
          )}
        </section>

        {week.status === "final" && (
          <section className="card flex flex-col gap-3">
            <h2 className="font-semibold">Correct a score</h2>
            <p className="text-sm text-muted">
              Sets a player&apos;s points for this week, before any x2. Results and payouts are recalculated.
            </p>
            <form action={overrideAction} className="flex flex-col gap-3">
              <input type="hidden" name="weekId" value={week.id} />
              <input type="hidden" name="weekNumber" value={week.number} />
              <select name="playerId" required className="field" defaultValue="">
                <option value="" disabled>
                  Choose a picked player
                </option>
                {picked.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.team}) · now {points.get(p.id) ?? 0} pts
                  </option>
                ))}
              </select>
              <input name="points" type="number" step="1" required placeholder="Corrected points" className="field" />
              <input name="reason" required placeholder="Reason, e.g. NFL stat correction" className="field" />
              <button className="btn-primary">Save correction</button>
            </form>
          </section>
        )}

        {overrides.length > 0 && (
          <section className="card">
            <h2 className="mb-2 font-semibold">Corrections this week</h2>
            <ul className="text-sm">
              {overrides.map((o) => (
                <li key={o.id} className="border-t border-border py-1.5 first:border-0">
                  <strong>{byId.get(o.player_id)?.name ?? o.player_id}</strong> → {o.points} pts · {o.reason}
                </li>
              ))}
            </ul>
          </section>
        )}

        {scores && scores.warnings.length > 0 && (
          <section className="card">
            <h2 className="mb-2 font-semibold">Plays to double-check</h2>
            <ul className="list-disc pl-5 text-sm">
              {scores.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </>
  );
}
