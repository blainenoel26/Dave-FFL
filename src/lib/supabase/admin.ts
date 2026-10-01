import { createClient } from "@supabase/supabase-js";
import { supabaseUrl } from "./server";

/**
 * Service-role client for server jobs (finalizing weeks, cron). Bypasses row-level security, so
 * only use it in server code after checking who is asking. Never import from a Client Component.
 */
export function createAdminClient() {
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!secret) throw new Error("SUPABASE_SECRET_KEY is not set");
  return createClient(supabaseUrl(), secret, { auth: { persistSession: false, autoRefreshToken: false } });
}
