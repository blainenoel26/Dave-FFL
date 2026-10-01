"use client";

import { useMemo, useState, useTransition } from "react";
import { SLOTS, isEligible, type Slot } from "@/lib/league/lineup";
import { makeContext, type PlayoffContextData, type PlayoffPlayer } from "@/lib/playoffs/context";
import { RESERVE_SLOTS, validateRosterChange, type PlayoffRoster, type ReserveSlot } from "@/lib/playoffs/rules";
import { savePlayoffRoster } from "./actions";

const SLOT_LABEL: Record<Slot, string> = {
  QB: "QB", RB1: "RB", RB2: "RB", WR1: "WR/TE", WR2: "WR/TE", WR3: "WR/TE", K: "K", DEF: "DEF",
};
const MAX_RESULTS = 60;

export interface Matchup {
  opponent: string;
  home: boolean;
  kickoff: string;
}

type Target = { kind: "active"; slot: Slot } | { kind: "reserve"; spot: ReserveSlot } | { kind: "swap"; spot: ReserveSlot };

const kickoffFormat = new Intl.DateTimeFormat(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" });

export function RosterEditor(props: {
  players: PlayoffPlayer[];
  context: PlayoffContextData;
  matchups: Record<string, Matchup>;
  initial: PlayoffRoster;
}) {
  const { players, context, matchups } = props;
  const byId = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);
  const ctx = useMemo(() => makeContext(context, players), [context, players]);
  const eliminated = useMemo(() => new Set(context.eliminated), [context]);

  const [saved, setSaved] = useState(props.initial);
  const [roster, setRoster] = useState(props.initial);
  const [target, setTarget] = useState<Target | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();

  const errors = validateRosterChange(saved, roster, ctx);
  const dirty = JSON.stringify(saved) !== JSON.stringify(roster);
  const isOut = (id: string | null | undefined) => !!id && eliminated.has(byId.get(id)?.team ?? "");
  const taken = new Set(
    [...SLOTS.map((s) => roster.actives[s]), ...RESERVE_SLOTS.map((r) => roster.reserves[r].playerId)].filter(
      (id): id is string => !!id,
    ),
  );

  function update(next: PlayoffRoster) {
    setRoster(next);
    setServerError(null);
    setTarget(null);
  }

  function choose(playerId: string | null) {
    if (!target) return;
    if (target.kind === "active") {
      const actives = { ...roster.actives };
      if (playerId) actives[target.slot] = playerId;
      else delete actives[target.slot];
      update({ ...roster, actives, doubled: !playerId && roster.doubled === target.slot ? null : roster.doubled });
    } else if (target.kind === "reserve") {
      update({ ...roster, reserves: { ...roster.reserves, [target.spot]: { playerId, used: false } } });
    }
  }

  function swapInto(slot: Slot) {
    if (target?.kind !== "swap") return;
    const incoming = roster.reserves[target.spot].playerId!;
    update({
      ...roster,
      actives: { ...roster.actives, [slot]: incoming },
      reserves: { ...roster.reserves, [target.spot]: { playerId: roster.actives[slot] ?? null, used: true } },
    });
  }

  function save() {
    startSaving(async () => {
      const result = await savePlayoffRoster(roster);
      if (result.ok) setSaved(roster);
      else setServerError(result.error);
    });
  }

  const matchupText = (id: string) => {
    const p = byId.get(id);
    if (!p) return "";
    if (eliminated.has(p.team)) return `${p.team} · eliminated`;
    const m = matchups[p.team];
    return m ? `${p.team} · ${m.home ? "vs" : "@"} ${m.opponent} · ${kickoffFormat.format(new Date(m.kickoff))}` : `${p.team} · bye`;
  };

  return (
    <>
      <h2 className="mt-2 font-semibold">Active lineup</h2>
      <ul className="flex flex-col gap-2">
        {SLOTS.map((slot) => {
          const id = roster.actives[slot];
          const player = id ? byId.get(id) : undefined;
          const locked = !!id && ctx.hasPlayed(id);
          return (
            <li key={slot} className="card flex items-center gap-3 p-3">
              <span className="w-12 shrink-0 text-xs font-semibold text-muted">{SLOT_LABEL[slot]}</span>
              <button
                type="button"
                disabled={locked}
                onClick={() => setTarget({ kind: "active", slot })}
                className="min-w-0 flex-1 text-left disabled:cursor-not-allowed"
              >
                {player ? (
                  <>
                    <span className={`block truncate font-medium ${isOut(id) ? "text-danger" : ""}`}>
                      {player.name}
                      {locked && <span className="ml-2 text-xs font-normal text-muted">🔒</span>}
                    </span>
                    <span className="block text-xs text-muted" suppressHydrationWarning>
                      {matchupText(player.id)}
                    </span>
                  </>
                ) : (
                  <span className="text-muted">Choose a player</span>
                )}
              </button>
              {slot !== "QB" && player && (
                <button
                  type="button"
                  onClick={() => update({ ...roster, doubled: roster.doubled === slot ? null : slot })}
                  aria-pressed={roster.doubled === slot}
                  className={`h-9 shrink-0 rounded-md border px-2 text-sm font-semibold ${
                    roster.doubled === slot ? "border-accent bg-accent text-[var(--accent-foreground)]" : "border-border text-muted"
                  }`}
                >
                  x2
                </button>
              )}
            </li>
          );
        })}
      </ul>

      <h2 className="mt-4 font-semibold">Reserves</h2>
      <p className="text-sm text-muted">
        Rename a reserve any time until you use it. Swap one in for any active player between rounds (or for a player
        who hasn&apos;t played yet). The player you take out moves to that reserve spot. Two swaps in all.
      </p>
      <ul className="flex flex-col gap-2">
        {RESERVE_SLOTS.map((spot) => {
          const r = roster.reserves[spot];
          const player = r.playerId ? byId.get(r.playerId) : undefined;
          const color = !player ? "" : isOut(r.playerId) ? "text-danger" : r.used ? "text-muted" : "text-accent";
          return (
            <li key={spot} className="card flex items-center gap-3 p-3">
              <span className="w-12 shrink-0 text-xs font-semibold text-muted">{spot}</span>
              <span className="min-w-0 flex-1">
                {player ? (
                  <>
                    <span className={`block truncate font-medium ${color}`}>
                      {player.name}
                      {r.used && <span className="ml-2 text-xs font-normal text-muted">used</span>}
                    </span>
                    <span className="block text-xs text-muted" suppressHydrationWarning>
                      {matchupText(player.id)}
                    </span>
                  </>
                ) : (
                  <span className="text-muted">{r.used ? "Used" : "No reserve named"}</span>
                )}
              </span>
              {!r.used && (
                <span className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    onClick={() => setTarget({ kind: "reserve", spot })}
                    className="h-9 rounded-md border border-border px-2 text-sm"
                  >
                    {player ? "Change" : "Name"}
                  </button>
                  {player && !isOut(r.playerId) && (
                    <button
                      type="button"
                      onClick={() => setTarget({ kind: "swap", spot })}
                      className="h-9 rounded-md border border-accent px-2 text-sm font-medium text-accent"
                    >
                      Swap in
                    </button>
                  )}
                </span>
              )}
            </li>
          );
        })}
      </ul>

      <div className="fixed inset-x-0 bottom-0 border-t border-border bg-surface/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center gap-3">
          <p role="status" className={`min-w-0 flex-1 text-sm ${serverError || (dirty && errors.length) ? "text-danger" : "text-muted"}`}>
            {serverError ?? (dirty ? (errors[0] ?? "You have unsaved changes") : "Roster accepted")}
          </p>
          {dirty || saving ? (
            <button type="button" onClick={save} disabled={saving || errors.length > 0} className="btn-primary w-auto px-6">
              {saving ? "Saving…" : "Save roster"}
            </button>
          ) : (
            <span className="flex h-12 items-center rounded-lg border border-accent px-4 font-medium text-accent">Accepted ✓</span>
          )}
        </div>
      </div>

      {target?.kind === "swap" && (
        <Sheet title={`Swap ${byId.get(roster.reserves[target.spot].playerId!)?.name} in for…`} onClose={() => setTarget(null)}>
          {SLOTS.filter((s) => isEligible(s, byId.get(roster.reserves[target.spot].playerId!)!.position)).map((slot) => {
            const id = roster.actives[slot];
            return (
              <li key={slot} className="border-b border-border last:border-0">
                <button type="button" onClick={() => swapInto(slot)} className="w-full py-3 text-left">
                  <span className="text-xs text-muted">{SLOT_LABEL[slot]}</span>{" "}
                  <span className={`font-medium ${isOut(id) ? "text-danger" : ""}`}>{id ? byId.get(id)?.name : "empty"}</span>
                </button>
              </li>
            );
          })}
        </Sheet>
      )}

      {(target?.kind === "active" || target?.kind === "reserve") && (
        <PlayerPicker
          players={players.filter(
            (p) =>
              (target.kind === "reserve" || isEligible(target.slot, p.position)) &&
              !eliminated.has(p.team) &&
              !taken.has(p.id) &&
              (target.kind === "reserve" || !ctx.roundGameStarted(p.id)),
          )}
          canClear={target.kind === "active" ? !!roster.actives[target.slot] : !!roster.reserves[target.spot].playerId}
          describe={matchupText}
          onChoose={choose}
          onClose={() => setTarget(null)}
        />
      )}
    </>
  );
}

function Sheet(props: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-10 flex flex-col bg-background" role="dialog" aria-label={props.title}>
      <div className="border-b border-border bg-surface px-4 py-3">
        <div className="mx-auto flex max-w-2xl items-center gap-3">
          <p className="flex-1 font-medium">{props.title}</p>
          <button type="button" onClick={props.onClose} className="text-sm text-muted underline">
            Cancel
          </button>
        </div>
      </div>
      <ul className="mx-auto w-full max-w-2xl flex-1 overflow-y-auto px-4 py-2">{props.children}</ul>
    </div>
  );
}

function PlayerPicker(props: {
  players: PlayoffPlayer[];
  canClear: boolean;
  describe: (id: string) => string;
  onChoose: (id: string | null) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const matches = props.players.filter((p) => !q || p.name.toLowerCase().includes(q) || p.team.toLowerCase() === q);

  return (
    <div className="fixed inset-0 z-10 flex flex-col bg-background" role="dialog" aria-label="Choose a player">
      <div className="border-b border-border bg-surface px-4 py-3">
        <div className="mx-auto flex max-w-2xl items-center gap-3">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name or team"
            className="field"
          />
          <button type="button" onClick={props.onClose} className="shrink-0 text-sm text-muted underline">
            Cancel
          </button>
        </div>
      </div>
      <ul className="mx-auto w-full max-w-2xl flex-1 overflow-y-auto px-4 py-2">
        {props.canClear && (
          <li>
            <button type="button" onClick={() => props.onChoose(null)} className="w-full py-3 text-left text-danger">
              Clear this spot
            </button>
          </li>
        )}
        {matches.slice(0, MAX_RESULTS).map((p) => (
          <li key={p.id} className="border-b border-border last:border-0">
            <button type="button" onClick={() => props.onChoose(p.id)} className="w-full py-3 text-left">
              <span className="block font-medium">{p.name}</span>
              <span className="block text-xs text-muted" suppressHydrationWarning>
                {p.position} · {props.describe(p.id)}
              </span>
            </button>
          </li>
        ))}
        {matches.length > MAX_RESULTS && (
          <li className="py-3 text-center text-sm text-muted">Keep typing to narrow {matches.length} players…</li>
        )}
        {matches.length === 0 && <li className="py-3 text-center text-sm text-muted">No players match.</li>}
      </ul>
    </div>
  );
}
