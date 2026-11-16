// Wording for league emails. Plain text so they read well in any mail app. Money is in cents.

const money = (cents: number) => `${cents < 0 ? "-" : ""}$${(Math.abs(cents) / 100).toFixed(2)}`;

export function reminderEmail(input: {
  ownerName: string;
  weekLabel: string;
  picks: number;
  hasDouble: boolean;
  url: string;
}): { subject: string; text: string } {
  const missing = [
    input.picks < 8 ? `${8 - input.picks} of your 8 picks` : null,
    input.hasDouble ? null : "your x2 pick",
  ].filter(Boolean);

  return {
    subject: `${input.weekLabel}: your lineup isn't finished`,
    text: [
      `Hi ${input.ownerName},`,
      "",
      `You still need ${missing.join(" and ")} for ${input.weekLabel}.`,
      "Each pick locks when that player's game kicks off.",
      "",
      `Make your picks: ${input.url}/picks`,
      "",
      "Dave FFL",
    ].join("\n"),
  };
}

export interface ResultRow {
  ownerName: string;
  place: number;
  points: number;
  payoutCents: number;
}

export function resultsEmail(input: {
  ownerName: string;
  weekLabel: string;
  results: ResultRow[];
  yourNetCents: number;
  url: string;
}): { subject: string; text: string } {
  const winners = input.results.filter((r) => r.payoutCents > 0);
  const table = input.results.map(
    (r) =>
      `${String(r.place).padStart(2)}. ${r.ownerName.padEnd(12)} ${String(r.points).padStart(4)}` +
      (r.payoutCents > 0 ? `  ${money(r.payoutCents)}` : ""),
  );

  return {
    subject: `${input.weekLabel} results: ${winners[0]?.ownerName ?? "nobody"} wins`,
    text: [
      `Hi ${input.ownerName},`,
      "",
      `${input.weekLabel} is final.`,
      "",
      ...table,
      "",
      `Your season balance: ${money(input.yourNetCents)}. Everyone settles up after the Super Bowl.`,
      "The commissioner can correct scores through Wednesday.",
      "",
      `Full results: ${input.url}/lineups`,
      "",
      "Dave FFL",
    ].join("\n"),
  };
}

export interface DigestLine {
  author: string;
  at: string; // already formatted, e.g. "Sun 4:12 PM ET"
  body: string;
}

const DIGEST_SHOWN = 10;

export function banterDigestEmail(input: {
  ownerName: string;
  lines: DigestLine[]; // oldest first
  url: string;
}): { subject: string; text: string } {
  const total = input.lines.length;
  const shown = input.lines.slice(-DIGEST_SHOWN);
  const clip = (s: string) => (s.length > 280 ? `${s.slice(0, 277)}…` : s);
  return {
    subject: `Dave FFL Banter: ${total} new message${total === 1 ? "" : "s"}`,
    text: [
      `Hi ${input.ownerName},`,
      "",
      total > shown.length
        ? `${total} new messages in Banter. The latest ${shown.length}:`
        : `${total} new message${total === 1 ? "" : "s"} in Banter:`,
      "",
      ...shown.flatMap((l) => [`${l.author} (${l.at}):`, clip(l.body), ""]),
      `Join in: ${input.url}/banter`,
      "",
      "Turn these emails off on the Banter page.",
      "",
      "Dave FFL",
    ].join("\n"),
  };
}
