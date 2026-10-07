import { AppHeader } from "@/components/app-header";
import type { Slot } from "@/lib/league/lineup";
import { getCurrentWeek, getPlayerOptions, getWeekLineups } from "@/lib/league/week";
import { createClient, getCurrentOwner } from "@/lib/supabase/server";
import { LineupEditor } from "./lineup-editor";

export default async function PicksPage() {
  const owner = await getCurrentOwner();
  const db = await createClient();
  const week = await getCurrentWeek(db);

  if (!owner || !week) {
    return (
      <>
        <AppHeader />
        <main className="page">
          <p className="card">{owner ? "No week is open for picks." : "Your login isn't linked to a league owner."}</p>
        </main>
      </>
    );
  }

  const [players, lineups] = await Promise.all([getPlayerOptions(db, week), getWeekLineups(db, week, owner.id)]);
  const mine = lineups.find((l) => l.ownerId === owner.id)?.picks ?? [];
  const initialPicks = Object.fromEntries(mine.map((p) => [p.slot, p.playerId])) as Partial<Record<Slot, string>>;
  const initialDoubled = mine.find((p) => p.doubled)?.slot ?? null;

  return (
    <>
      <AppHeader />
      <main className="page pb-28">
        <h1 className="text-xl font-semibold">{week.label} picks</h1>
        <p className="text-sm text-muted">
          Each pick locks when that player&apos;s game kicks off. Everyone can see your lineup once it&apos;s saved.
        </p>
        <LineupEditor
          weekId={week.id}
          players={players}
          initialPicks={initialPicks}
          initialDoubled={initialDoubled}
        />
      </main>
    </>
  );
}
