import Link from "next/link";
import { signOut } from "@/app/login/actions";
import { unreadCount } from "@/lib/banter/data";
import { createClient, getCurrentOwner } from "@/lib/supabase/server";

export async function AppHeader() {
  const owner = await getCurrentOwner();
  const unread = owner ? await unreadCount(await createClient(), owner.id) : 0;

  const links = [
    { href: "/picks", label: "Picks" },
    { href: "/lineups", label: "Lineups" },
    { href: "/banter", label: unread ? `Banter (${unread > 99 ? "99+" : unread})` : "Banter", highlight: unread > 0 },
    { href: "/money", label: "Money" },
    { href: "/playoffs", label: "Playoffs" },
    { href: "/scoring", label: "Scoring" },
    ...(owner?.role === "commissioner" ? [{ href: "/commish", label: "Commish" }] : []),
  ];

  return (
    <header className="border-b border-border bg-surface">
      <nav className="mx-auto flex max-w-2xl items-center gap-4 overflow-x-auto whitespace-nowrap px-4 py-3 text-sm">
        <Link href="/" className="font-semibold">
          Dave FFL
        </Link>
        {links.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className={"highlight" in l && l.highlight ? "font-semibold text-accent" : "text-muted hover:text-foreground"}
          >
            {l.label}
          </Link>
        ))}
        <form action={signOut} className="ml-auto">
          <button className="text-muted underline">Sign out</button>
        </form>
      </nav>
    </header>
  );
}
