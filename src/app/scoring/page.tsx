import Link from "next/link";
import { AppHeader } from "@/components/app-header";
import { getCurrentWeek } from "@/lib/league/week";
import { RULES_2026 as R, type AllowedBand, type Tier } from "@/lib/scoring/rules";
import { emptyOffenseLine, scoreDefense, scoreOffense, type DefenseLine, type OffenseLine } from "@/lib/scoring/score";
import { createClient } from "@/lib/supabase/server";

// Everything on this page is generated from the scoring settings the app actually uses
// (src/lib/scoring/rules.ts), and the examples are scored by the real scoring code.

const pts = (n: number) => `${n > 0 ? "+" : ""}${n}`;
const money = (cents: number) => `$${(cents / 100).toFixed(cents % 100 ? 2 : 0)}`;

function tierRows(tiers: readonly Tier[], unit = "yds"): [string, string][] {
  return tiers.map((t, i) => {
    const next = tiers[i + 1];
    const range = next ? `${t.minYards}–${next.minYards - 1} ${unit}` : `${t.minYards}+ ${unit}`;
    return [range, pts(t.points)];
  });
}

function allowedRows(bands: readonly AllowedBand[]): [string, string][] {
  return bands.map((b, i) => {
    const from = i === 0 ? 0 : (bands[i - 1].maxAllowed ?? 0) + 1;
    const label =
      b.maxAllowed === 0 ? "Shutout (0 allowed)" : b.maxAllowed === null ? `${from}+ allowed` : `${from}–${b.maxAllowed} allowed`;
    return [label, pts(b.points)];
  });
}

const offense = (patch: Partial<OffenseLine>) => scoreOffense({ ...emptyOffenseLine(), ...patch }, R);
const defense = (line: DefenseLine) => scoreDefense(line, R);

export default async function ScoringPage() {
  const week = await getCurrentWeek(await createClient()).catch(() => null);
  const payouts = week?.payoutTableCents ?? [];

  const qb = offense({ passYards: 325, passTds: [10, 30], interceptions: 1, rushYards: 30 });
  const rb = offense({ rushYards: 110, recYards: 24, rushTds: [52], twoPointConversions: 1 });
  const k = offense({ fieldGoals: [50, 38], extraPoints: 3 });
  const def = defense({ sacks: 3, turnovers: 2, safeties: 0, touchdowns: 1, pointsAllowed: 9 });

  return (
    <>
      <AppHeader />
      <main className="page">
        <div>
          <h1 className="text-xl font-semibold">Scoring</h1>
          <p className="text-sm text-muted">
            Dave FFL isn&apos;t standard fantasy scoring: touchdowns are worth more the longer they are, yards only count in
            full 25-yard chunks, and there are no points per reception.
          </p>
        </div>

        <Section title="Your weekly lineup">
          <ul className="list-disc space-y-1 pl-5 text-sm">
            <li>8 picks: <strong>QB, 2 RB, 3 WR/TE, K and a team defense</strong>. Any NFL player, and other owners can pick the same players.</li>
            <li>
              <strong>x2:</strong> choose one non-QB pick (any RB, WR/TE, K or DEF). That player&apos;s points count double.
            </li>
            <li>Each pick locks when that player&apos;s game kicks off. Other owners&apos; picks stay hidden until then.</li>
            <li>A player who doesn&apos;t play scores 0.</li>
          </ul>
        </Section>

        <Section title="Passing (QBs)">
          <Table
            rows={[
              ...tierRows(R.passTd).map(([r, p]) => [`TD pass, ${r}`, p] as [string, string]),
              [`${R.passBonusThreshold}+ passing yards`, pts(R.passBonusPoints)],
              [`Each full ${R.yardsPerPoint} yds past ${R.passBonusThreshold}`, pts(1)],
              ["Interception thrown", pts(R.interceptionThrown)],
            ]}
          />
          <Note>
            Passing yards under {R.passBonusThreshold} score nothing. 340 yards = {R.passBonusPoints} + 1 ={" "}
            {offense({ passYards: 340 })} points.
          </Note>
        </Section>

        <Section title="Rushing and receiving (any player, QBs included)">
          <Table
            rows={[
              ...tierRows(R.rushRecReturnTd).map(([r, p]) => [`Rushing or receiving TD, ${r}`, p] as [string, string]),
              [`Each full ${R.yardsPerPoint} rushing yds`, pts(1)],
              [`Each full ${R.yardsPerPoint} receiving yds`, pts(1)],
              ["Receptions", "0"],
            ]}
          />
          <Note>
            Rushing and receiving yards count separately: 24 rushing + 24 receiving = {offense({ rushYards: 24, recYards: 24 })}{" "}
            points, but 50 rushing = {offense({ rushYards: 50 })}.
          </Note>
        </Section>

        <Section title="Kick and punt returns">
          <Table
            rows={[
              [`Each full ${R.yardsPerPoint} return yds`, pts(1)],
              ["Return TD", "same as a rushing TD (by length)"],
            ]}
          />
          <Note>Returns count for the player who returns the kick, not the team defense.</Note>
        </Section>

        <Section title="2-point conversions">
          <Table
            rows={[
              ["Throwing a successful 2-point pass", pts(R.twoPointPass)],
              ["Running or catching a successful 2-point conversion", pts(R.twoPointConversion)],
            ]}
          />
        </Section>

        <Section title="Kickers">
          <Table
            rows={[
              ...tierRows(R.fieldGoal).map(([r, p]) => [`Field goal, ${r}`, p] as [string, string]),
              ["Extra point", pts(R.extraPoint)],
            ]}
          />
          <Note>Missed kicks aren&apos;t penalized.</Note>
        </Section>

        <Section title="Team defense">
          <Table
            rows={[
              ["Takeaway (interception or fumble recovery)", pts(R.defense.turnover)],
              ["Sack", pts(R.defense.sack)],
              ["Safety", pts(R.defense.safety)],
              ["Defensive TD (any length)", pts(R.defense.touchdown)],
              ...allowedRows(R.defense.pointsAllowed),
            ]}
          />
          <Note>
            Points allowed means everything the opponent scored, including touchdowns given up by the offense or on special
            teams. Only one points-allowed line applies: a shutout is {pts(R.defense.pointsAllowed[0].points)} total.
          </Note>
        </Section>

        <Section title="Examples">
          <Table
            rows={[
              ["QB: 325 pass yds, TD passes of 10 and 30 yds, 1 INT, 30 rush yds", `${qb}`],
              ["RB: 110 rush yds, 24 rec yds, 52-yd rushing TD, a 2-point run", `${rb} (${rb * 2} as x2)`],
              ["K: field goals of 50 and 38 yds, 3 extra points", `${k}`],
              ["DEF: 3 sacks, 2 takeaways (one returned for a TD), 9 points allowed", `${def}`],
            ]}
          />
          <Note>
            QB: 4 + 6 (TD passes) + 4 + 1 (325 yds) − 1 (INT) + 1 (30 rush yds). RB: 4 (110 rush yds) + 0 (24 rec yds) + 12
            (52-yd TD) + 2 (2-point run). DEF: 3 (sacks) + 4 (takeaways) + 6 (TD) + 2 (9 allowed).
          </Note>
        </Section>

        <Section title="The fine print">
          <ul className="list-disc space-y-1 pl-5 text-sm">
            <li>A distance exactly on a boundary scores the higher tier: a 25-yard TD is 25–49, a 45-yard field goal is 45+.</li>
            <li>Lateral touchdowns: the passer and the player who scores both get a TD of the full play length.</li>
            <li>No points for fumbles lost, missed kicks, or a defense returning a 2-point try.</li>
            <li>Stats come from ESPN&apos;s box scores. The commissioner can correct a score through Wednesday.</li>
          </ul>
        </Section>

        {payouts.length > 0 && (
          <Section title="Weekly payouts">
            <Table rows={payouts.map((c, i) => [`${ordinal(i + 1)} place`, money(c)] as [string, string])} />
            <Note>
              Ties share the prize money of the places they cover, split evenly to the cent. Two owners tied for 2nd each get
              ({money(payouts[1] ?? 0)} + {money(payouts[2] ?? 0)}) ÷ 2. Nothing is paid week to week: winnings and fees go
              into your season balance (see <Link href="/money" className="underline">Money</Link>), settled after the Super
              Bowl.
            </Note>
          </Section>
        )}
      </main>
    </>
  );
}

function ordinal(n: number): string {
  return `${n}${n === 1 ? "st" : n === 2 ? "nd" : n === 3 ? "rd" : "th"}`;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="card flex flex-col gap-2">
      <h2 className="font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function Table({ rows }: { rows: [string, string][] }) {
  return (
    <table className="w-full text-sm">
      <tbody>
        {rows.map(([label, value]) => (
          <tr key={label} className="border-t border-border first:border-0">
            <td className="py-1.5 pr-3">{label}</td>
            <td className="py-1.5 text-right font-medium tabular-nums">{value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-muted">{children}</p>;
}
