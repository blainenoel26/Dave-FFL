"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { MAX_MESSAGE_LENGTH, PAGE_SIZE, REACTIONS, type BanterMessage, type Reaction } from "@/lib/banter/data";
import { createClient } from "@/lib/supabase/browser";
import {
  deleteMessage,
  editMessage,
  fetchMessages,
  markBanterRead,
  postMessage,
  setDigest,
  toggleReaction,
  type ActionResult,
} from "./actions";

const timeFormat = new Intl.DateTimeFormat(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" });
const dateFormat = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

function when(iso: string): string {
  const d = new Date(iso);
  return Date.now() - d.getTime() < 6 * 24 * 60 * 60 * 1000 ? timeFormat.format(d) : dateFormat.format(d);
}

/** Newer messages replace the latest page; older pages already loaded are kept. */
function merge(prev: BanterMessage[], latest: BanterMessage[]): BanterMessage[] {
  if (!latest.length) return prev.length ? prev : latest;
  const oldestLatest = latest[0].id;
  return [...prev.filter((m) => m.id < oldestLatest), ...latest];
}

export function BanterChat(props: {
  initial: BanterMessage[];
  meId: string;
  isCommissioner: boolean;
  digestOn: boolean;
}) {
  const { meId, isCommissioner } = props;
  const [messages, setMessages] = useState(props.initial);
  const [hasOlder, setHasOlder] = useState(props.initial.length === PAGE_SIZE);
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState<{ id: number; text: string } | null>(null);
  const [picker, setPicker] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [digestOn, setDigestOn] = useState(props.digestOn);
  const [pending, startTransition] = useTransition();
  const bottomRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    const latest = await fetchMessages();
    setMessages((prev) => merge(prev, latest));
    await markBanterRead();
  }, []);

  // Live updates: re-fetch when anyone posts, edits, deletes or reacts. Poll once a minute as a backup.
  useEffect(() => {
    const supabase = createClient();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const soon = () => {
      clearTimeout(timer);
      timer = setTimeout(() => void refresh(), 300);
    };
    let channel: ReturnType<typeof supabase.channel> | undefined;
    void supabase.auth.getSession().then(({ data }) => {
      if (data.session) supabase.realtime.setAuth(data.session.access_token);
      channel = supabase
        .channel("banter")
        .on("postgres_changes", { event: "*", schema: "public", table: "banter_messages" }, soon)
        .on("postgres_changes", { event: "*", schema: "public", table: "banter_reactions" }, soon)
        .subscribe();
    });
    const poll = setInterval(() => void refresh(), 60_000);
    return () => {
      clearTimeout(timer);
      clearInterval(poll);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [refresh]);

  // Keep the newest message in view.
  const lastId = messages[messages.length - 1]?.id;
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [lastId]);

  function run(action: () => Promise<ActionResult>, after?: () => void) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) setError(result.error);
      else {
        after?.();
        await refresh();
      }
    });
  }

  async function loadOlder() {
    const older = await fetchMessages(messages[0]?.id);
    setHasOlder(older.length === PAGE_SIZE);
    setMessages((prev) => [...older, ...prev]);
  }

  return (
    <div className="flex flex-col gap-3 pb-40">
      <label className="flex items-center gap-2 text-sm text-muted">
        <input
          type="checkbox"
          checked={digestOn}
          onChange={(e) => {
            const on = e.target.checked;
            setDigestOn(on);
            run(() => setDigest(on));
          }}
        />
        Email me a daily summary of new messages
      </label>

      {hasOlder && (
        <button type="button" onClick={() => void loadOlder()} className="text-sm text-muted underline">
          Show earlier messages
        </button>
      )}

      {messages.length === 0 && <p className="card text-sm text-muted">No messages yet. Start the trash talk.</p>}

      <ul className="flex flex-col gap-2">
        {messages.map((m) => {
          const mine = m.ownerId === meId;
          return (
            <li key={m.id} className={`card p-3 ${mine ? "border-accent" : ""}`}>
              <div className="flex items-baseline justify-between gap-2 text-xs text-muted">
                <span className="font-semibold text-foreground">{m.ownerName}</span>
                <span suppressHydrationWarning>
                  {when(m.createdAt)}
                  {m.edited && !m.deleted && " · edited"}
                </span>
              </div>

              {m.deleted ? (
                <p className="mt-1 text-sm italic text-muted">Message deleted</p>
              ) : editing?.id === m.id ? (
                <div className="mt-2 flex flex-col gap-2">
                  <textarea
                    value={editing.text}
                    onChange={(e) => setEditing({ id: m.id, text: e.target.value })}
                    maxLength={MAX_MESSAGE_LENGTH}
                    rows={3}
                    className="w-full rounded-lg border border-border bg-surface p-2 text-base"
                  />
                  <div className="flex gap-3 text-sm">
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => run(() => editMessage(m.id, editing.text), () => setEditing(null))}
                      className="font-medium text-accent"
                    >
                      Save
                    </button>
                    <button type="button" onClick={() => setEditing(null)} className="text-muted">
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <p className="mt-1 whitespace-pre-wrap break-words text-base">{m.body}</p>
              )}

              {!m.deleted && (
                <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                  {m.reactions.map((r) => (
                    <button
                      key={r.emoji}
                      type="button"
                      onClick={() => run(() => toggleReaction(m.id, r.emoji))}
                      className={`rounded-full border px-2 py-0.5 ${
                        r.ownerIds.includes(meId) ? "border-accent bg-accent/10" : "border-border"
                      }`}
                    >
                      {r.emoji} {r.ownerIds.length}
                    </button>
                  ))}
                  {picker === m.id ? (
                    REACTIONS.filter((e) => !m.reactions.some((r) => r.emoji === e)).map((emoji: Reaction) => (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => run(() => toggleReaction(m.id, emoji), () => setPicker(null))}
                        className="rounded-full border border-border px-2 py-0.5"
                      >
                        {emoji}
                      </button>
                    ))
                  ) : (
                    <button
                      type="button"
                      onClick={() => setPicker(m.id)}
                      aria-label="Add a reaction"
                      className="rounded-full border border-border px-2 py-0.5 text-muted"
                    >
                      ☺+
                    </button>
                  )}
                  <span className="ml-auto flex gap-3 text-xs text-muted">
                    {mine && (
                      <button type="button" onClick={() => setEditing({ id: m.id, text: m.body })}>
                        Edit
                      </button>
                    )}
                    {(mine || isCommissioner) && (
                      <button
                        type="button"
                        onClick={() => {
                          if (confirm(mine ? "Delete your message?" : `Remove ${m.ownerName}'s message?`)) {
                            run(() => deleteMessage(m.id));
                          }
                        }}
                      >
                        {mine ? "Delete" : "Remove"}
                      </button>
                    )}
                  </span>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <div ref={bottomRef} />

      <form
        className="fixed inset-x-0 bottom-0 border-t border-border bg-surface/95 px-4 py-3 backdrop-blur"
        onSubmit={(e) => {
          e.preventDefault();
          const text = draft;
          run(() => postMessage(text), () => setDraft(""));
        }}
      >
        <div className="mx-auto flex max-w-2xl flex-col gap-1">
          {error && <p className="text-sm text-danger">{error}</p>}
          <div className="flex items-end gap-2">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !("ontouchstart" in window)) {
                  e.preventDefault();
                  e.currentTarget.form?.requestSubmit();
                }
              }}
              maxLength={MAX_MESSAGE_LENGTH}
              rows={2}
              placeholder="Talk some trash…"
              className="min-h-12 flex-1 resize-none rounded-lg border border-border bg-surface p-2 text-base outline-none focus:border-accent"
            />
            <button type="submit" disabled={pending || !draft.trim()} className="btn-primary w-auto px-5">
              Send
            </button>
          </div>
          {draft.length > MAX_MESSAGE_LENGTH - 100 && (
            <p className="text-xs text-muted">
              {draft.length}/{MAX_MESSAGE_LENGTH}
            </p>
          )}
        </div>
      </form>
    </div>
  );
}
