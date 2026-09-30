"use server";

import { revalidatePath } from "next/cache";
import type { Slot } from "@/lib/league/lineup";
import { createClient } from "@/lib/supabase/server";

export type SaveResult = { ok: true } | { ok: false; error: string };

export async function saveLineup(
  weekId: number,
  picks: Partial<Record<Slot, string>>,
  doubledSlot: Slot | null,
): Promise<SaveResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("save_lineup", {
    p_week_id: weekId,
    p_picks: picks,
    p_doubled_slot: doubledSlot,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/");
  revalidatePath("/picks");
  revalidatePath("/lineups");
  return { ok: true };
}
