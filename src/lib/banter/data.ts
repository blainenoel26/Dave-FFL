// Banter (league chat) data, read with the viewer's client so row-level security applies.
import type { SupabaseClient } from "@supabase/supabase-js";

export const REACTIONS = ["👍", "😂", "🔥", "😬", "🏈"] as const;
export type Reaction = (typeof REACTIONS)[number];
export const MAX_MESSAGE_LENGTH = 1000;
export const PAGE_SIZE = 100;

export interface BanterMessage {
  id: number;
  ownerId: string;
  ownerName: string;
  body: string;
  createdAt: string;
  edited: boolean;
  deleted: boolean;
  reactions: { emoji: Reaction; ownerIds: string[] }[];
}

type Row = {
  id: number;
  owner_id: string;
  body: string;
  created_at: string;
  edited_at: string | null;
  deleted_at: string | null;
  owners: { display_name: string } | null;
  banter_reactions: { emoji: Reaction; owner_id: string }[];
};

/** The latest messages (oldest first), optionally only those older than a message. */
export async function loadMessages(db: SupabaseClient, beforeId?: number): Promise<BanterMessage[]> {
  let query = db
    .from("banter_messages")
    .select("id, owner_id, body, created_at, edited_at, deleted_at, owners!banter_messages_owner_id_fkey(display_name), banter_reactions(emoji, owner_id)")
    .order("id", { ascending: false })
    .limit(PAGE_SIZE);
  if (beforeId) query = query.lt("id", beforeId);
  const { data, error } = await query;
  if (error) throw new Error(`banter_messages: ${error.message}`);

  return ((data ?? []) as unknown as Row[]).reverse().map((m) => ({
    id: m.id,
    ownerId: m.owner_id,
    ownerName: m.owners?.display_name ?? "?",
    body: m.deleted_at ? "" : m.body,
    createdAt: m.created_at,
    edited: !!m.edited_at,
    deleted: !!m.deleted_at,
    reactions: REACTIONS.map((emoji) => ({
      emoji,
      ownerIds: m.banter_reactions.filter((r) => r.emoji === emoji).map((r) => r.owner_id),
    })).filter((r) => r.ownerIds.length > 0),
  }));
}

/** Messages from other owners since the viewer last opened Banter. */
export async function unreadCount(db: SupabaseClient, ownerId: string): Promise<number> {
  const { data: read } = await db.from("banter_reads").select("last_read_at").eq("owner_id", ownerId).maybeSingle();
  let query = db
    .from("banter_messages")
    .select("id", { count: "exact", head: true })
    .neq("owner_id", ownerId)
    .is("deleted_at", null);
  if (read?.last_read_at) query = query.gt("created_at", read.last_read_at);
  const { count, error } = await query;
  return error ? 0 : (count ?? 0);
}

export async function markRead(db: SupabaseClient, ownerId: string): Promise<void> {
  await db.from("banter_reads").upsert({ owner_id: ownerId, last_read_at: new Date().toISOString() }, { onConflict: "owner_id" });
}
