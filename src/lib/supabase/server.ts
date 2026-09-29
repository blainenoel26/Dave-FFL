import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export function supabaseUrl(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set (see .env.example)");
  return url;
}

export function supabaseKey(): string {
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!key) throw new Error("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is not set (see .env.example)");
  return key;
}

/** Per-request Supabase client for Server Components and Server Functions. */
export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(supabaseUrl(), supabaseKey(), {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (toSet) => {
        try {
          for (const { name, value, options } of toSet) cookieStore.set(name, value, options);
        } catch {
          // Called from a Server Component, where cookies are read-only. The proxy refreshes
          // the session on every request, so this is safe to ignore.
        }
      },
    },
  });
}

export interface CurrentOwner {
  id: string;
  ownerCode: string;
  displayName: string;
  role: "owner" | "commissioner";
}

/** The signed-in league owner, or null if not signed in or not linked to an owner row. */
export async function getCurrentOwner(): Promise<CurrentOwner | null> {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims) return null;

  const { data } = await supabase
    .from("owners")
    .select("id, owner_code, display_name, role")
    .eq("auth_user_id", claims.claims.sub)
    .maybeSingle();
  if (!data) return null;

  return { id: data.id, ownerCode: data.owner_code, displayName: data.display_name, role: data.role };
}
