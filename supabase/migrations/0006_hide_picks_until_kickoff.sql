-- Hide other owners' picks until each player's game kicks off. See docs/LEAGUE-RULES.md → Lineup.
-- Undo: supabase/rollbacks/0006_rollback.sql

-- ── Weekly picks ────────────────────────────────────────────────────────────
-- Before: every league member (and the commissioner, through "commissioner writes") could read
-- every pick. After: you read your own picks, and anyone else's once that player has kicked off.
drop policy "league members read" on public.lineup_picks;
drop policy "commissioner writes" on public.lineup_picks;

create policy "own picks, or picks that have kicked off" on public.lineup_picks for select to authenticated
  using (
    public.current_owner_id() is not null
    and (
      exists (select 1 from public.lineups l where l.id = lineup_id and l.owner_id = public.current_owner_id())
      or not public.pick_is_open(lineup_id, player_id)
    )
  );

-- The commissioner keeps write access (lineup fixes use the server, but keep parity), not read.
create policy "commissioner inserts" on public.lineup_picks for insert to authenticated
  with check (public.is_commissioner());
create policy "commissioner updates" on public.lineup_picks for update to authenticated
  using (public.is_commissioner()) with check (public.is_commissioner());
create policy "commissioner deletes" on public.lineup_picks for delete to authenticated
  using (public.is_commissioner());

-- Which slots each owner has filled (never the players), so "6/8 picks" still shows.
create function public.week_filled_slots(p_week_id bigint)
returns table (owner_id uuid, slot text)
language sql stable security definer set search_path = public as $$
  select l.owner_id, p.slot
  from public.lineups l
  join public.lineup_picks p on p.lineup_id = l.id
  where l.week_id = p_week_id and public.current_owner_id() is not null
$$;
revoke all on function public.week_filled_slots(bigint) from public;
grant execute on function public.week_filled_slots(bigint) to authenticated;

-- ── Playoff rosters ─────────────────────────────────────────────────────────
-- Rosters are stored whole, so the server reads them and hides unplayed players before display.
-- Owners can read only their own saved versions directly.
drop policy "league members read" on public.playoff_roster_versions;
create policy "own roster versions" on public.playoff_roster_versions for select to authenticated
  using (owner_id = public.current_owner_id());
