-- Undo 0006: everyone in the league can read every pick again (the pre-week-5 behavior).
drop policy if exists "own picks, or picks that have kicked off" on public.lineup_picks;
drop policy if exists "commissioner inserts" on public.lineup_picks;
drop policy if exists "commissioner updates" on public.lineup_picks;
drop policy if exists "commissioner deletes" on public.lineup_picks;
create policy "league members read" on public.lineup_picks for select to authenticated
  using (public.current_owner_id() is not null);
create policy "commissioner writes" on public.lineup_picks for all to authenticated
  using (public.is_commissioner()) with check (public.is_commissioner());

drop policy if exists "own roster versions" on public.playoff_roster_versions;
create policy "league members read" on public.playoff_roster_versions for select to authenticated
  using (public.current_owner_id() is not null);

-- week_filled_slots stays; it's harmless and the app uses it.
