import { describe, expect, it } from "vitest";
import { emptyRoster, type PlayoffRoster } from "./rules";
import { currentRound, rosterAt, rosterForRound, roundInProgress, type Round, type RoundGame } from "./season";

const game = (kickoff: string, state: RoundGame["state"]): RoundGame => ({
  homeTeam: "A", awayTeam: "B", kickoff, state, homeScore: null, awayScore: null,
});
const round = (number: number, games: RoundGame[]): Round => ({ id: number, number, label: `R${number}`, games });

const withQb = (qb: string): PlayoffRoster => ({ ...emptyRoster(), actives: { QB: qb } });

describe("currentRound", () => {
  it("is the first round that isn't finished", () => {
    const rounds = [
      round(1, [game("2027-01-16T21:30:00Z", "post")]),
      round(2, [game("2027-01-23T21:30:00Z", "pre")]),
      round(3, []),
    ];
    expect(currentRound(rounds)?.number).toBe(2);
  });
});

describe("roundInProgress", () => {
  const r = round(1, [game("2027-01-16T21:30:00Z", "post"), game("2027-01-18T01:15:00Z", "pre")]);

  it("is true from the first kickoff until every game is final", () => {
    expect(roundInProgress(r, new Date("2027-01-17T12:00:00Z"))).toBe(true);
  });

  it("is false before the round starts", () => {
    const upcoming = round(2, [game("2027-01-23T21:30:00Z", "pre")]);
    expect(roundInProgress(upcoming, new Date("2027-01-20T12:00:00Z"))).toBe(false);
  });

  it("is false once every game is final", () => {
    const done = round(1, [game("2027-01-16T21:30:00Z", "post")]);
    expect(roundInProgress(done, new Date("2027-01-20T12:00:00Z"))).toBe(false);
  });
});

describe("roster versions", () => {
  const versions = [
    { roster: withQb("early"), savedAt: "2027-01-10T00:00:00Z" },
    { roster: withQb("midRound"), savedAt: "2027-01-17T12:00:00Z" },
    { roster: withQb("afterRound"), savedAt: "2027-01-20T12:00:00Z" },
  ];

  it("takes the latest version saved at or before a moment", () => {
    expect(rosterAt(versions, new Date("2027-01-18T00:00:00Z")).actives.QB).toBe("midRound");
    expect(rosterAt(versions, new Date("2027-01-01T00:00:00Z"))).toEqual(emptyRoster());
  });

  it("scores a finished round from the roster at its last kickoff", () => {
    const r = round(1, [game("2027-01-16T21:30:00Z", "post"), game("2027-01-18T01:15:00Z", "post")]);
    expect(rosterForRound(versions, r, new Date("2027-01-25T00:00:00Z")).actives.QB).toBe("midRound");
  });

  it("uses the current roster for a round still under way", () => {
    const r = round(2, [game("2027-01-24T21:30:00Z", "pre")]);
    expect(rosterForRound(versions, r, new Date("2027-01-21T00:00:00Z")).actives.QB).toBe("afterRound");
  });
});
