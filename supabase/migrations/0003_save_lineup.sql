-- Saves the signed-in owner's lineup for a week in one transaction.
-- Runs as the caller (security invoker), so row-level security still applies; the explicit checks
-- below exist to give clear error messages. See docs/LEAGUE-RULES.md → Lineup.
--
--   p_picks:        {"QB": "<player id>", "RB1": "<player id>", …}; missing or null = empty slot
--   p_doubled_slot: slot holding the doubled pick, or null
create function public.save_lineup(p_week_id bigint, p_picks jsonb, p_doubled_slot text)
returns void
language plpgsql security invoker set search_path = public as $$
declare
  slots constant text[] := array['QB', 'RB1', 'RB2', 'WR1', 'WR2', 'WR3', 'K', 'DEF'];
  v_owner uuid := public.current_owner_id();
  v_lineup bigint;
  v_slot text;
  v_new text;
  v_old text;
  v_position text;
  v_name text;
  v_changed text[] := '{}';
  v_old_double_slot text;
  v_old_double_player text;
  v_new_double_player text;
begin
  if v_owner is null then
    raise exception 'You are not signed in as a league owner';
  end if;
  if not exists (select 1 from weeks where id = p_week_id and status not in ('final', 'closed')) then
    raise exception 'This week is no longer open for picks';
  end if;
  if p_doubled_slot is not null and not (p_doubled_slot = any (slots)) then
    raise exception 'Unknown slot %', p_doubled_slot;
  end if;
  if p_doubled_slot = 'QB' then
    raise exception 'The QB cannot be doubled';
  end if;

  insert into lineups (week_id, owner_id) values (p_week_id, v_owner)
  on conflict (week_id, owner_id) do nothing;
  select id into v_lineup from lineups where week_id = p_week_id and owner_id = v_owner;

  select slot, player_id into v_old_double_slot, v_old_double_player
  from lineup_picks where lineup_id = v_lineup and is_doubled;

  -- Validate every changed slot before touching anything.
  foreach v_slot in array slots loop
    v_new := nullif(p_picks ->> v_slot, '');
    select player_id into v_old from lineup_picks where lineup_id = v_lineup and slot = v_slot;
    continue when v_old is not distinct from v_new;

    if v_old is not null and not pick_is_open(v_lineup, v_old) then
      select full_name into v_name from nfl_players where id = v_old;
      raise exception '% has already kicked off and can''t be changed', v_name;
    end if;

    if v_new is not null then
      select position, full_name into v_position, v_name from nfl_players where id = v_new;
      if not found then
        raise exception 'Unknown player %', v_new;
      end if;
      if not (
        (v_slot = 'QB' and v_position = 'QB') or
        (v_slot in ('RB1', 'RB2') and v_position = 'RB') or
        (v_slot in ('WR1', 'WR2', 'WR3') and v_position in ('WR', 'TE')) or
        (v_slot = 'K' and v_position = 'K') or
        (v_slot = 'DEF' and v_position = 'DEF')
      ) then
        raise exception '% (%) can''t play the % slot', v_name, v_position, v_slot;
      end if;
      if not pick_is_open(v_lineup, v_new) then
        raise exception '% has already kicked off', v_name;
      end if;
    end if;

    v_changed := v_changed || v_slot;
  end loop;

  -- The doubled pick locks at its player's kickoff and can't move onto a player who has kicked off.
  v_new_double_player := case when p_doubled_slot is null then null else nullif(p_picks ->> p_doubled_slot, '') end;
  if v_old_double_player is distinct from v_new_double_player
     or v_old_double_slot is distinct from p_doubled_slot then
    if v_old_double_player is not null and not pick_is_open(v_lineup, v_old_double_player) then
      raise exception 'Your doubled pick has already kicked off and can''t be moved';
    end if;
    if v_new_double_player is not null and not pick_is_open(v_lineup, v_new_double_player) then
      raise exception 'You can''t double a player who has already kicked off';
    end if;
  end if;

  -- Apply: remove changed slots first so swaps between slots don't collide.
  delete from lineup_picks where lineup_id = v_lineup and slot = any (v_changed);
  insert into lineup_picks (lineup_id, slot, player_id)
  select v_lineup, s, p_picks ->> s
  from unnest(v_changed) as s
  where nullif(p_picks ->> s, '') is not null;

  update lineup_picks set is_doubled = false, updated_at = now()
  where lineup_id = v_lineup and is_doubled and slot is distinct from p_doubled_slot;
  update lineup_picks set is_doubled = true, updated_at = now()
  where lineup_id = v_lineup and slot = p_doubled_slot and not is_doubled;
end;
$$;

revoke all on function public.save_lineup(bigint, jsonb, text) from public;
grant execute on function public.save_lineup(bigint, jsonb, text) to authenticated;
