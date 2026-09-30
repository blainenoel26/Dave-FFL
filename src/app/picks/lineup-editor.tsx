"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { SLOTS, isEligible, type Slot } from "@/lib/league/lineup";
import { isLocked, type PlayerOption } from "@/lib/league/week";
import { Matchup } from "@/components/matchup";
import { saveLineup } from "./actions";

const SLOT_LABEL: Record<Slot, string> = {
  QB: "QB", RB1: "RB", RB2: "RB", WR1: "WR/TE", WR2: "WR/TE", WR3: "WR/TE", K: "K", DEF: "DEF",
};
const MAX_RESULTS = 60;

type Picks = Partial<Record<Slot, string>>;

export function LineupEditor(props: {
  weekId: number;
  players: PlayerOption[];
  initialPicks: Picks;
  initialDoubled: Slot | null;
}) {
  const { weekId, players } = props;
  const byId = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);

  const [saved, setSaved] = useState({ picks: props.initialPicks, doubled: props.initialDoubled });
  const [picks, setPicks] = useState<Picks>(props.initialPicks);
  const [doubled, setDoubled] = useState<Slot | null>(props.initialDoubled);
  const [openSlot, setOpenSlot] = useState<Slot | null>(null);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [saving, startSaving] = useTransition();
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const locked = (playerId: string | undefined) => !!playerId && isLocked(byId.get(playerId)?.kickoff ?? null, now);
  const doubledLocked = doubled !== null && locked(saved.picks[doubled]) && saved.doubled === doubled;
  const dirty =
    doubled !== saved.doubled || SLOTS.some((s) => (picks[s] ?? null) !== (saved.picks[s] ?? null));

  function choose(slot: Slot, playerId: string | null) {
    setPicks((prev) => {
      const next = { ...prev };
      if (playerId) next[slot] = playerId;
      else delete next[slot];
      return next;
    });
    if (!playerId && doubled === slot) setDoubled(null);
    setOpenSlot(null);
    setMessage(null);
  }

  function toggleDouble(slot: Slot) {
    setDoubled((prev) => (prev === slot ? null : slot));
    setMessage(null);
  }

  function save() {
    startSaving(async () => {
      const result = await saveLineup(weekId, picks, doubled);
      if (result.ok) {
        setSaved({ picks, doubled });
        setMessage({ kind: "ok", text: "Lineup saved." });
      } else {
        setMessage({ kind: "error", text: result.error });
      }
    });
  }

  return (
    <>
      <ul className="mt-4 flex flex-col gap-2">
        {SLOTS.map((slot) => {
          const player = picks[slot] ? byId.get(picks[slot]!) : undefined;
          const slotLocked = locked(saved.picks[slot]) && saved.picks[slot] === picks[slot];
          const canDouble =
            slot !== "QB" && !!player && !locked(player.id) && !doubledLocked;
          return (
            <li key={slot} className="card flex items-center gap-3 p-3">
              <span className="w-12 shrink-0 text-xs font-semibold text-muted">{SLOT_LABEL[slot]}</span>
              <button
                type="button"
                disabled={slotLocked}
                onClick={() => setOpenSlot(slot)}
                className="min-w-0 flex-1 text-left disabled:cursor-not-allowed"
              >
                {player ? (
                  <>
                    <span className="block truncate font-medium">
                      {player.name}
                      {slotLocked && <span className="ml-2 text-xs text-muted">🔒 locked</span>}
                    </span>
                    <span className="block text-xs text-muted">
                      {player.team} · <Matchup player={player} />
                    </span>
                  </>
                ) : (
                  <span className="text-muted">Choose a player</span>
                )}
              </button>
              {slot !== "QB" && player && (
                <button
                  type="button"
                  disabled={doubled === slot ? doubledLocked : !canDouble}
                  onClick={() => toggleDouble(slot)}
                  aria-pressed={doubled === slot}
                  className={`h-9 shrink-0 rounded-md border px-2 text-sm font-semibold disabled:opacity-40 ${
                    doubled === slot
                      ? "border-accent bg-accent text-[var(--accent-foreground)]"
                      : "border-border text-muted"
                  }`}
                >
                  x2
                </button>
              )}
            </li>
          );
        })}
      </ul>

      <div className="fixed inset-x-0 bottom-0 border-t border-border bg-surface/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center gap-3">
          <p
            role="status"
            className={`min-w-0 flex-1 text-sm ${message?.kind === "error" ? "text-danger" : "text-muted"}`}
          >
            {message?.text ?? (dirty ? "Unsaved changes" : "All changes saved")}
          </p>
          <button type="button" onClick={save} disabled={!dirty || saving} className="btn-primary w-auto px-6">
            {saving ? "Saving…" : "Save lineup"}
          </button>
        </div>
      </div>

      {openSlot && (
        <PlayerSheet
          slot={openSlot}
          players={players}
          taken={new Set(SLOTS.filter((s) => s !== openSlot).map((s) => picks[s]).filter(Boolean) as string[])}
          current={picks[openSlot]}
          now={now}
          onChoose={(id) => choose(openSlot, id)}
          onClose={() => setOpenSlot(null)}
        />
      )}
    </>
  );
}

function PlayerSheet(props: {
  slot: Slot;
  players: PlayerOption[];
  taken: Set<string>;
  current: string | undefined;
  now: Date;
  onChoose: (playerId: string | null) => void;
  onClose: () => void;
}) {
  const { slot, players, taken, current, now, onChoose, onClose } = props;
  const [query, setQuery] = useState("");

  const eligible = useMemo(() => players.filter((p) => isEligible(slot, p.position)), [players, slot]);
  const q = query.trim().toLowerCase();
  const matches = eligible.filter(
    (p) => !q || p.name.toLowerCase().includes(q) || p.team.toLowerCase() === q,
  );

  return (
    <div className="fixed inset-0 z-10 flex flex-col bg-background" role="dialog" aria-label={`Choose ${SLOT_LABEL[slot]}`}>
      <div className="border-b border-border bg-surface px-4 py-3">
        <div className="mx-auto flex max-w-2xl items-center gap-3">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search ${SLOT_LABEL[slot]} by name or team`}
            className="field"
          />
          <button type="button" onClick={onClose} className="shrink-0 text-sm text-muted underline">
            Cancel
          </button>
        </div>
      </div>
      <ul className="mx-auto w-full max-w-2xl flex-1 overflow-y-auto px-4 py-2">
        {current && (
          <li>
            <button type="button" onClick={() => onChoose(null)} className="w-full py-3 text-left text-danger">
              Clear this slot
            </button>
          </li>
        )}
        {matches.slice(0, MAX_RESULTS).map((p) => {
          const unavailable = taken.has(p.id) || isLocked(p.kickoff, now) || !p.gameId;
          const reason = taken.has(p.id)
            ? "already in your lineup"
            : !p.gameId
              ? "bye week"
              : isLocked(p.kickoff, now)
                ? "kicked off"
                : null;
          return (
            <li key={p.id} className="border-b border-border last:border-0">
              <button
                type="button"
                disabled={unavailable}
                onClick={() => onChoose(p.id)}
                className="flex w-full items-center justify-between gap-3 py-3 text-left disabled:opacity-40"
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium">
                    {p.name} {p.id === current && <span className="text-xs text-accent">current</span>}
                  </span>
                  <span className="block text-xs text-muted">
                    {p.position} · {p.team} · <Matchup player={p} />
                  </span>
                </span>
                {reason && <span className="shrink-0 text-xs text-muted">{reason}</span>}
              </button>
            </li>
          );
        })}
        {matches.length > MAX_RESULTS && (
          <li className="py-3 text-center text-sm text-muted">Keep typing to narrow {matches.length} players…</li>
        )}
        {matches.length === 0 && <li className="py-3 text-center text-sm text-muted">No players match.</li>}
      </ul>
    </div>
  );
}
