// Daily Banter digest: emails each joined owner who has the digest on and has unread messages
// from others since they last read Banter or got a digest. Runs from the daily cron.
import type { SupabaseClient } from "@supabase/supabase-js";
import { banterDigestEmail } from "../email/messages";
import { sendEmails, siteUrl } from "../email/send";

const etFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  weekday: "short",
  hour: "numeric",
  minute: "2-digit",
});

export async function sendBanterDigests(admin: SupabaseClient, now = new Date()): Promise<number> {
  const [{ data: owners }, { data: reads }] = await Promise.all([
    admin.from("owners").select("id, display_name, email, auth_user_id, banter_digest"),
    admin.from("banter_reads").select("owner_id, last_read_at, last_digest_at"),
  ]);
  const readOf = new Map((reads ?? []).map((r) => [r.owner_id, r]));
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

  // Everything from the last day at most; each owner then filters to what they haven't seen.
  const { data: recent } = await admin
    .from("banter_messages")
    .select("owner_id, body, created_at, owners!banter_messages_owner_id_fkey(display_name)")
    .is("deleted_at", null)
    .gt("created_at", dayAgo)
    .order("created_at");
  const messages = (recent ?? []) as unknown as {
    owner_id: string;
    body: string;
    created_at: string;
    owners: { display_name: string } | null;
  }[];
  if (!messages.length) return 0;

  const emails = [];
  const digested: string[] = [];
  for (const o of owners ?? []) {
    if (!o.auth_user_id || !o.banter_digest) continue;
    const read = readOf.get(o.id);
    const since = [read?.last_read_at, read?.last_digest_at, dayAgo].filter(Boolean).sort().pop()!;
    const unseen = messages.filter((m) => m.owner_id !== o.id && m.created_at > since);
    if (!unseen.length) continue;
    emails.push({
      to: o.email as string,
      ...banterDigestEmail({
        ownerName: o.display_name,
        lines: unseen.map((m) => ({
          author: m.owners?.display_name ?? "?",
          at: `${etFormat.format(new Date(m.created_at))} ET`,
          body: m.body,
        })),
        url: siteUrl(),
      }),
    });
    digested.push(o.id);
  }
  if (!emails.length) return 0;

  const sent = await sendEmails(emails);
  const stamp = now.toISOString();
  await admin.from("banter_reads").upsert(
    digested.map((id) => ({
      owner_id: id,
      last_digest_at: stamp,
      last_read_at: readOf.get(id)?.last_read_at ?? dayAgo,
    })),
    { onConflict: "owner_id" },
  );
  return sent;
}
