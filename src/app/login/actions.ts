"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type LoginState =
  | { step: "email"; error?: string }
  | { step: "code"; email: string; error?: string };

export async function sendCode(_prev: LoginState, form: FormData): Promise<LoginState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  if (!email) return { step: "email", error: "Enter your email." };

  const supabase = await createClient();
  const { data: isMember, error: checkError } = await supabase.rpc("is_league_email", {
    p_email: email,
  });
  if (checkError) return { step: "email", error: "Couldn't reach the league server. Try again." };
  if (!isMember) return { step: "email", error: "That email isn't on the league roster." };

  const origin = (await headers()).get("origin") ?? "";
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true, emailRedirectTo: `${origin}/auth/callback` },
  });
  if (error) return { step: "email", error: error.message };

  return { step: "code", email };
}

export async function verifyCode(prev: LoginState, form: FormData): Promise<LoginState> {
  if (prev.step !== "code") return prev;
  const token = String(form.get("code") ?? "").replace(/\s/g, "");
  if (!token) return { ...prev, error: "Enter the code from your email." };

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ email: prev.email, token, type: "email" });
  if (error) return { ...prev, error: "That code didn't work. Check it or request a new one." };

  redirect("/");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
