import Link from "next/link";
import { signOut } from "@/app/login/actions";
import { getCurrentOwner } from "@/lib/supabase/server";

const LINKS = [
  { href: "/picks", label: "Picks" },
  { href: "/lineups", label: "Lineups" },
  { href: "/money", label: "Money" },
  { href: "/playoffs", label: "Playoffs" },
];

export async function AppHeader() {
  const owner = await getCurrentOwner();
  const links = owner?.role === "commissioner" ? [...LINKS, { href: "/commish", label: "Commish" }] : LINKS;

  return (
    <header className="border-b border-border bg-surface">
      <nav className="mx-auto flex max-w-2xl items-center gap-4 overflow-x-auto whitespace-nowrap px-4 py-3 text-sm">
        <Link href="/" className="font-semibold">
          Dave FFL
        </Link>
        {links.map((l) => (
          <Link key={l.href} href={l.href} className="text-muted hover:text-foreground">
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
