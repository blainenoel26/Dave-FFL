import { getCurrentOwner } from "@/lib/supabase/server";
import { signOut } from "./login/actions";

export default async function Home() {
  const owner = await getCurrentOwner();

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-8">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Dave FFL</h1>
        <form action={signOut}>
          <button className="text-sm text-muted underline">Sign out</button>
        </form>
      </header>

      {owner ? (
        <section className="card">
          <p className="text-lg">Welcome, {owner.displayName}.</p>
          <p className="mt-1 text-sm text-muted">
            {owner.role === "commissioner" ? "Commissioner · " : ""}Lineups and live scores are coming next.
          </p>
        </section>
      ) : (
        <section className="card">
          <p>Your login isn&apos;t linked to a league owner yet. Ask the commissioner to check your email on the roster.</p>
        </section>
      )}
    </main>
  );
}
