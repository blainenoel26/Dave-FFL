// Who gets which league email. Uses the service-role client: call only from cron jobs or after a
// commissioner check.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Week } from "../league/week";
import { reminderEmail, resultsEmail } from "./messages";
import { sendEmails, siteUrl, type Email } from "./send";

interface OwnerRow {
  id: string;
  display_name: string;
  email: string;
}

async function seasonOwners(admin: SupabaseClient, seasonId: number): Promise<OwnerRow[]> {
  const { data, error } = await admin
    .from("season_owners")
    .select("owners(id, display_name, email)")
    .eq("season_id", seasonId);
  if (error) throw new Error(`season_owners: ${error.message}`);
  return (data ?? []).map((r) => r.owners as unknown as OwnerRow);
}

/** Emails every owner whose lineup is missing picks or the x2, if any game hasn't kicked off. */
export async function sendPickReminders(admin: SupabaseClient, week: Week, now = new Date()): Promise<number> {
  if (!week.games.some((g) => new Date(g.kickoff) > now)) return 0;

  const { data: seasonRow } = await admin.from("weeks").select("season_id").eq("id", week.id).single();
  const owners = await seasonOwners(admin, seasonRow!.season_id);
  const { data: lineups, error } = await admin
    .from("lineups")
    .select("owner_id, lineup_picks(is_doubled)")
    .eq("week_id", week.id);
  if (error) throw new Error(`lineups: ${error.message}`);

  const picksByOwner = new Map(
    (lineups ?? []).map((l) => [l.owner_id as string, l.lineup_picks as { is_doubled: boolean }[]]),
  );
  const emails: Email[] = [];
  for (const owner of owners) {
    const picks = picksByOwner.get(owner.id) ?? [];
    const hasDouble = picks.some((p) => p.is_doubled);
    if (picks.length === 8 && hasDouble) continue;
    emails.push({
      to: owner.email,
      ...reminderEmail({ ownerName: owner.display_name, weekLabel: week.label, picks: picks.length, hasDouble, url: siteUrl() }),
    });
  }
  return emails.length ? sendEmails(emails) : 0;
}

/** Emails every owner the week's final standings and their season balance. */
export async function sendWeekResults(admin: SupabaseClient, weekId: number): Promise<number> {
  const { data: week, error: weekError } = await admin
    .from("weeks")
    .select("label, season_id")
    .eq("id", weekId)
    .single();
  if (weekError) throw new Error(`weeks: ${weekError.message}`);

  const [owners, { data: results }, { data: ledger }] = await Promise.all([
    seasonOwners(admin, week.season_id),
    admin.from("week_results").select("owner_id, points, place, payout_cents").eq("week_id", weekId).order("place"),
    admin.from("ledger_entries").select("owner_id, cents").eq("season_id", week.season_id),
  ]);
  const nameOf = new Map(owners.map((o) => [o.id, o.display_name]));
  const rows = (results ?? []).map((r) => ({
    ownerName: nameOf.get(r.owner_id) ?? "?",
    place: r.place,
    points: Number(r.points),
    payoutCents: r.payout_cents,
  }));
  const net = new Map<string, number>();
  for (const e of ledger ?? []) net.set(e.owner_id, (net.get(e.owner_id) ?? 0) + e.cents);

  return sendEmails(
    owners.map((owner) => ({
      to: owner.email,
      ...resultsEmail({
        ownerName: owner.display_name,
        weekLabel: week.label,
        results: rows,
        yourNetCents: net.get(owner.id) ?? 0,
        url: siteUrl(),
      }),
    })),
  );
}
