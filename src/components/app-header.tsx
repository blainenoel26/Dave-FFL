import Link from "next/link";
import { signOut } from "@/app/login/actions";
import { unreadCount } from "@/lib/banter/data";
import { createClient, getCurrentOwner } from "@/lib/supabase/server";
import { BanterLink } from "./banter-link";

export async function AppHeader() {
  const owner = await getCurrentOwner();
  const unread = owner ? await unreadCount(await createClient(), owner.id) : 0;

  const before = [
    { href: "/picks", label: "Picks" },
    { href: "/lineups", label: "Lineups" },
  ];
  const after = [
    { href: "/money", label: "Money" },
    { href: "/playoffs", label: "Playoffs" },
    { href: "/scoring", label: "Scoring" },
    ...(owner?.role === "commissioner" ? [{ href: "/commish", label: "Commish" }] : []),
  ];
  const link = (l: { href: string; label: string }) => (
    <Link key={l.href} href={l.href} className="text-muted hover:text-foreground">
      {l.label}
    </Link>
  );

  return (
    <header className="border-b border-border bg-surface">
      <nav className="mx-auto flex max-w-2xl items-center gap-4 overflow-x-auto whitespace-nowrap px-4 py-3 text-sm">
        <Link href="/" className="font-semibold">
          Dave FFL
        </Link>
        {before.map(link)}
        {owner && <BanterLink initialUnread={unread} />}
        {after.map(link)}
        <form action={signOut} className="ml-auto">
          <button className="text-muted underline">Sign out</button>
        </form>
      </nav>
    </header>
  );
}
