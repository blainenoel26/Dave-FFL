// Serializable game state for checking playoff roster changes, shared by server and browser.
import type { Position } from "../league/lineup";
import type { PlayoffContext } from "./rules";

export interface PlayoffPlayer {
  id: string;
  name: string;
  position: Position;
  team: string;
}

export interface PlayoffContextData {
  playedTeams: string[];
  startedThisRound: string[];
  eliminated: string[];
  inProgress: boolean;
}

export function makeContext(data: PlayoffContextData, players: readonly PlayoffPlayer[]): PlayoffContext {
  const byId = new Map(players.map((p) => [p.id, p]));
  const played = new Set(data.playedTeams);
  const started = new Set(data.startedThisRound);
  const out = new Set(data.eliminated);
  const teamOf = (id: string) => byId.get(id)?.team ?? "";
  return {
    positionOf: (id) => byId.get(id)?.position,
    hasPlayed: (id) => played.has(teamOf(id)),
    roundGameStarted: (id) => out.has(teamOf(id)) || started.has(teamOf(id)),
    roundInProgress: data.inProgress,
  };
}
