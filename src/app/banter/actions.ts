"use server";

import { revalidatePath } from "next/cache";
import { MAX_MESSAGE_LENGTH, REACTIONS, loadMessages, markRead, type BanterMessage, type Reaction } from "@/lib/banter/data";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient, getCurrentOwner } from "@/lib/supabase/server";

export type ActionResult = { ok: true } | { ok: false; error: string };

async function me() {
  const owner = await getCurrentOwner();
  if (!owner) throw new Error("You are not signed in as a league owner");
  return owner;
}

function clean(body: string): string | null {
  const text = body.replace(/\r\n/g, "\n").trim();
  return text && text.length <= MAX_MESSAGE_LENGTH ? text : null;
}

export async function fetchMessages(beforeId?: number): Promise<BanterMessage[]> {
  await me();
  return loadMessages(await createClient(), beforeId);
}

export async function postMessage(body: string): Promise<ActionResult> {
  const owner = await me();
  const text = clean(body);
  if (!text) return { ok: false, error: `Messages need 1–${MAX_MESSAGE_LENGTH} characters.` };
  const db = await createClient();
  const { error } = await db.from("banter_messages").insert({ owner_id: owner.id, body: text });
  if (error) return { ok: false, error: error.message };
  await markRead(db, owner.id);
  return { ok: true };
}

export async function editMessage(id: number, body: string): Promise<ActionResult> {
  const owner = await me();
  const text = clean(body);
  if (!text) return { ok: false, error: `Messages need 1–${MAX_MESSAGE_LENGTH} characters.` };
  const { error, count } = await (await createClient())
    .from("banter_messages")
    .update({ body: text, edited_at: new Date().toISOString() }, { count: "exact" })
    .eq("id", id)
    .eq("owner_id", owner.id)
    .is("deleted_at", null);
  if (error) return { ok: false, error: error.message };
  return count ? { ok: true } : { ok: false, error: "You can only edit your own messages." };
}

/** Owners delete their own messages; the commissioner can remove anyone's. The text is wiped. */
export async function deleteMessage(id: number): Promise<ActionResult> {
  const owner = await me();
  const db = await createClient();
  let query = db
    .from("banter_messages")
    .update({ body: "[deleted]", deleted_at: new Date().toISOString(), deleted_by: owner.id }, { count: "exact" })
    .eq("id", id);
  if (owner.role !== "commissioner") query = query.eq("owner_id", owner.id);
  const { error, count } = await query;
  if (error) return { ok: false, error: error.message };
  return count ? { ok: true } : { ok: false, error: "You can only delete your own messages." };
}

export async function toggleReaction(messageId: number, emoji: Reaction): Promise<ActionResult> {
  const owner = await me();
  if (!REACTIONS.includes(emoji)) return { ok: false, error: "Unknown reaction" };
  const db = await createClient();
  const { data: existing } = await db
    .from("banter_reactions")
    .select("message_id")
    .eq("message_id", messageId)
    .eq("owner_id", owner.id)
    .eq("emoji", emoji)
    .maybeSingle();
  const { error } = existing
    ? await db.from("banter_reactions").delete().eq("message_id", messageId).eq("owner_id", owner.id).eq("emoji", emoji)
    : await db.from("banter_reactions").insert({ message_id: messageId, owner_id: owner.id, emoji });
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function markBanterRead(): Promise<void> {
  const owner = await me();
  await markRead(await createClient(), owner.id);
}

export async function setDigest(on: boolean): Promise<ActionResult> {
  const owner = await me();
  const { error } = await createAdminClient().from("owners").update({ banter_digest: on }).eq("id", owner.id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/banter");
  return { ok: true };
}
