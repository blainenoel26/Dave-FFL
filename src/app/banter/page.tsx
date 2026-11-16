import { AppHeader } from "@/components/app-header";
import { loadMessages, markRead } from "@/lib/banter/data";
import { createClient, getCurrentOwner } from "@/lib/supabase/server";
import { BanterChat } from "./chat";

export default async function BanterPage() {
  const owner = await getCurrentOwner();
  if (!owner) {
    return (
      <>
        <AppHeader />
        <main className="page">
          <p className="card">Your login isn&apos;t linked to a league owner.</p>
        </main>
      </>
    );
  }

  const db = await createClient();
  const messages = await loadMessages(db);
  // Opening Banter marks everything read (before the header counts unread messages).
  await markRead(db, owner.id);

  return (
    <>
      <AppHeader />
      <main className="page">
        <div>
          <h1 className="text-xl font-semibold">Banter</h1>
          <p className="text-sm text-muted">The whole league sees this. Keep it fun.</p>
        </div>
        <BanterChat
          initial={messages}
          meId={owner.id}
          isCommissioner={owner.role === "commissioner"}
        />
      </main>
    </>
  );
}
