"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { getUnreadCount } from "@/app/banter/actions";
import { createClient } from "@/lib/supabase/browser";

const BASE_TITLE = "Dave FFL";

/**
 * The Banter tab with a live unread badge. Updates when anyone posts (Supabase Realtime, with a
 * once-a-minute fallback), and mirrors the count in the browser tab title and, for a home-screen
 * app, on the app icon where the phone supports it.
 */
export function BanterLink({ initialUnread }: { initialUnread: number }) {
  const onBanter = usePathname() === "/banter";
  const [unread, setUnread] = useState(initialUnread);
  const shown = onBanter ? 0 : unread;

  useEffect(() => {
    if (onBanter) return;
    const supabase = createClient();
    const refresh = () => void getUnreadCount().then(setUnread).catch(() => {});
    let channel: ReturnType<typeof supabase.channel> | undefined;
    void supabase.auth.getSession().then(({ data }) => {
      if (data.session) supabase.realtime.setAuth(data.session.access_token);
      channel = supabase
        .channel("banter-badge")
        .on("postgres_changes", { event: "*", schema: "public", table: "banter_messages" }, refresh)
        .subscribe();
    });
    const poll = setInterval(refresh, 60_000);
    return () => {
      clearInterval(poll);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [onBanter]);

  useEffect(() => {
    document.title = shown ? `(${shown}) ${BASE_TITLE}` : BASE_TITLE;
    const nav = navigator as Navigator & { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
    if (shown) void nav.setAppBadge?.(shown).catch(() => {});
    else void nav.clearAppBadge?.().catch(() => {});
  }, [shown]);

  return (
    <Link
      href="/banter"
      className={`inline-flex items-center gap-1 ${shown ? "font-semibold text-foreground" : "text-muted hover:text-foreground"}`}
      aria-label={shown ? `Banter, ${shown} unread` : "Banter"}
    >
      Banter
      {shown > 0 && (
        <span className="min-w-5 rounded-full bg-danger px-1.5 text-center text-xs font-bold leading-5 text-white">
          {shown > 99 ? "99+" : shown}
        </span>
      )}
    </Link>
  );
}
