"use server";

import { revalidatePath } from "next/cache";
import type { SaveResult } from "@/app/picks/actions";
import { makeContext } from "@/lib/playoffs/context";
import { loadPlayoffs } from "@/lib/playoffs/data";
import { validateRosterChange, type PlayoffRoster } from "@/lib/playoffs/rules";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient, getCurrentOwner } from "@/lib/supabase/server";

/** Saves the signed-in owner's playoff roster after checking every rule against live game data. */
export async function savePlayoffRoster(roster: PlayoffRoster): Promise<SaveResult> {
  const owner = await getCurrentOwner();
  if (!owner) return { ok: false, error: "You are not signed in as a league owner" };

  const view = await loadPlayoffs(await createClient());
  if (!view || view.players.length === 0) return { ok: false, error: "Playoff picks aren't open yet" };
  const mine = view.standings.find((s) => s.ownerId === owner.id);
  if (!mine) return { ok: false, error: "You aren't in this season's playoffs" };

  const errors = validateRosterChange(mine.roster, roster, makeContext(view.context, view.players));
  if (errors.length) return { ok: false, error: errors.join(". ") };

  const { error } = await createAdminClient()
    .from("playoff_roster_versions")
    .insert({ season_id: view.seasonId, owner_id: owner.id, roster, saved_by: owner.id });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/playoffs");
  return { ok: true };
}
