"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useActionState } from "react";
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
  const linkFailed = useSearchParams().get("error") === "link";
  const [state, action, pending] = useActionState<LoginState, FormData>(loginAction, {
    step: "email",
    error: linkFailed
      ? "That sign-in link didn't work. Open it on the same device and browser you requested it from, or request a new one."
      : undefined,
  });

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-4 py-12">
      <div>
        <h1 className="text-2xl font-semibold">Dave FFL</h1>
        <p className="mt-1 text-sm text-muted">
          {state.step === "email"
            ? "Sign in with the email you use for the league."
            : `Check ${state.email}. Tap the sign-in link in the email on this device, or enter the code if the email has one.`}
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
