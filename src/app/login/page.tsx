"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useActionState, useEffect } from "react";
import { sendCode, verifyCode, type LoginState } from "./actions";

async function loginAction(prev: LoginState, form: FormData): Promise<LoginState> {
  if (form.get("restart")) return { step: "email" };
  return prev.step === "email" ? sendCode(prev, form) : verifyCode(prev, form);
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  // If Supabase fell back to the Site URL, the link's tokens arrive here; finish signing in.
  useEffect(() => {
    if (/access_token|error_code/.test(window.location.hash)) {
      window.location.replace(`/auth/confirm${window.location.hash}`);
    }
  }, []);

  const linkFailed = useSearchParams().get("error") === "link";
  const [state, action, pending] = useActionState<LoginState, FormData>(loginAction, {
    step: "email",
    error: linkFailed
      ? "That sign-in link didn't work. It may have expired or already been used. Request a new one below."
      : undefined,
  });

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-4 py-12">
      <div>
        <h1 className="text-2xl font-semibold">Dave FFL</h1>
        <p className="mt-1 text-sm text-muted">
          {state.step === "email"
            ? "Sign in with the email you use for the league."
            : `We emailed ${state.email}. Enter the 6-digit code from the email, or tap the sign-in link in it.`}
        </p>
      </div>

      <form action={action} className="flex flex-col gap-3">
        {state.step === "email" ? (
          <input
            key="email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            required
            placeholder="you@example.com"
            className="field"
          />
        ) : (
          <input
            key="code"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            required
            placeholder="Code from your email"
            className="field tracking-widest"
          />
        )}

        {state.error && <p className="text-sm text-danger">{state.error}</p>}

        <button type="submit" disabled={pending} className="btn-primary">
          {pending ? "Working…" : state.step === "email" ? "Email me a sign-in link" : "Sign in with code"}
        </button>

        {state.step === "code" && (
          <button
            type="submit"
            name="restart"
            value="1"
            formNoValidate
            className="text-sm text-muted underline"
          >
            Use a different email
          </button>
        )}
      </form>
    </main>
  );
}
