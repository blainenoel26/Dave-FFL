import Link from "next/link";
import { AppHeader } from "@/components/app-header";
import { LocalTime } from "@/components/local-time";
import { getCurrentWeek, getWeekLineups } from "@/lib/league/week";
import { createClient, getCurrentOwner } from "@/lib/supabase/server";

export default async function Home() {
  const owner = await getCurrentOwner();
  const db = await createClient();
  const week = owner ? await getCurrentWeek(db) : null;
  const lineups = week ? await getWeekLineups(db, week, owner?.id ?? null) : [];
  const mine = lineups.find((l) => l.ownerId === owner?.id);
  const submitted = lineups.filter((l) => l.filledSlots.length > 0).length;
  const firstKickoff = week?.games.find((g) => g.status === "scheduled")?.kickoff;

  return (
    <>
      <AppHeader />
      <main className="page">
        {!owner ? (
          <p className="card">
            Your login isn&apos;t linked to a league owner yet. Ask the commissioner to check your email on the roster.
          </p>
        ) : (
          <>
            <p className="text-lg">Welcome, {owner.displayName}.</p>
            {week && (
              <section className="card flex flex-col gap-3">
                <div>
                  <h2 className="text-lg font-semibold">{week.label}</h2>
                  {firstKickoff && (
                    <p className="text-sm text-muted">
                      Next kickoff <LocalTime iso={firstKickoff} />
                    </p>
                  )}
                </div>
                <p className="text-sm">
                  Your lineup: <strong>{mine?.picks.length ?? 0} of 8</strong> picks
                  {mine?.picks.some((p) => p.doubled) ? ", doubled pick set" : ", no doubled pick yet"}.
                </p>
                <p className="text-sm text-muted">
                  {submitted} of {lineups.length} owners have picks in.
                </p>
                <div className="flex gap-3">
                  <Link href="/picks" className="btn-primary flex items-center justify-center">
                    Make picks
                  </Link>
                  <Link
                    href="/lineups"
                    className="flex h-12 w-full items-center justify-center rounded-lg border border-border font-medium"
                  >
                    All lineups
                  </Link>
                </div>
              </section>
            )}
          </>
        )}
      </main>
    </>
  );
}
