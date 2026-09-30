"use client";

import type { PlayerOption } from "@/lib/league/week";

const kickoffFormat = new Intl.DateTimeFormat(undefined, {
  weekday: "short",
  hour: "numeric",
  minute: "2-digit",
});

/** "vs CLE · Thu 8:15 PM" in the viewer's own time zone. */
export function Matchup({ player }: { player: Pick<PlayerOption, "opponent" | "home" | "kickoff"> }) {
  if (!player.opponent || !player.kickoff) return <span>Bye</span>;
  return (
    <span suppressHydrationWarning>
      {player.home ? "vs" : "@"} {player.opponent} · {kickoffFormat.format(new Date(player.kickoff))}
    </span>
  );
}
