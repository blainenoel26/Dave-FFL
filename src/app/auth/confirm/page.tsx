"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/browser";

/** Signs in with the tokens in the URL fragment; resolves to an error message, or null on success. */
async function completeSignIn(hash: string): Promise<string | null> {
  const params = new URLSearchParams(hash.slice(1));
  const accessToken = params.get("access_token");
  const refreshToken = params.get("refresh_token");

  if (!accessToken || !refreshToken) {
    return params.get("error_code") === "otp_expired"
      ? "That sign-in link has expired or was already used. Each link works once."
      : "That sign-in link didn't work.";
  }

  const { error } = await createClient().auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  });
  return error ? "That sign-in link didn't work." : null;
}

// Landing page for the sign-in link. The link puts the session tokens in the URL fragment, so it
// works in whatever browser opens it (including a mail app's built-in browser).
export default function ConfirmPage() {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    completeSignIn(window.location.hash).then((message) => {
      if (message) setError(message);
      else window.location.replace("/");
    });
  }, []);

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-4 px-4 py-12">
      <h1 className="text-2xl font-semibold">Dave FFL</h1>
      {error ? (
        <>
          <p className="text-danger">{error}</p>
          <Link href="/login" className="btn-primary flex items-center justify-center">
            Get a new link
          </Link>
        </>
      ) : (
        <p className="text-muted">Signing you in…</p>
      )}
    </main>
  );
}
