import Link from "next/link";
import { AppHeader } from "@/components/app-header";
import type { Slot } from "@/lib/league/lineup";
import { getPlayerOptions, getWeek, getWeekLineups } from "@/lib/league/week";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient, getCurrentOwner } from "@/lib/supabase/server";
import { LineupEditor } from "@/app/picks/lineup-editor";
import { commishSaveLineup } from "../actions";

export default async function CommishLineupPage(props: PageProps<"/commish/lineup">) {
  const { week: weekParam, owner: ownerParam } = await props.searchParams;
  const me = await getCurrentOwner();
  if (me?.role !== "commissioner") {
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
  // The one place the commissioner sees an owner's picks before kickoff: opening a lineup to fix it
  // (checked above; every fix is logged). Read on the server, past the hide-until-kickoff rule.
  const lineups = week ? await getWeekLineups(createAdminClient(), week) : [];
  const target = lineups.find((l) => l.ownerId === ownerParam);
  if (!week || !target) {
    return (
      <>
        <AppHeader />
        <main className="page">
          <p className="card">Couldn&apos;t find that owner or week.</p>
        </main>
      </>
    );
  }

  const players = await getPlayerOptions(db, week);
  const initialPicks = Object.fromEntries(target.picks.map((p) => [p.slot, p.playerId])) as Partial<Record<Slot, string>>;
  const initialDoubled = target.picks.find((p) => p.doubled)?.slot ?? null;

  return (
    <>
      <AppHeader />
      <main className="page pb-28">
        <Link href={`/commish?week=${week.number}`} className="text-sm text-muted underline">
          ← Back to Commissioner
        </Link>
        <h1 className="text-xl font-semibold">
          Fix {target.ownerName}&apos;s {week.label} lineup
        </h1>
        {week.status === "closed" ? (
          <p className="card">This week is closed. Lineups can&apos;t be changed.</p>
        ) : (
          <>
            <p className="card text-sm">
              Commissioner override: kickoff locks don&apos;t apply here. Positions and the one-x2 rule still do. The
              change is logged{week.status === "final" ? ", and this week's results and payouts are recalculated" : ""}.
            </p>
            <LineupEditor
              weekId={week.id}
              players={players}
              initialPicks={initialPicks}
              initialDoubled={initialDoubled}
              save={commishSaveLineup.bind(null, target.ownerId)}
              ignoreLocks
            />
          </>
        )}
      </main>
    </>
  );
}
