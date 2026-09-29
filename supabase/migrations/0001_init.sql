-- Dave FFL initial schema. See docs/PLAN.md → Data model and docs/LEAGUE-RULES.md.
-- Money is integer cents. Totals and payouts are derived; week_results is a rebuildable cache.

-- ── League ──────────────────────────────────────────────────────────────────
create table public.seasons (
  id                  bigint generated always as identity primary key,
  year                int  not null unique,
  entry_fee_cents     int  not null default 1000,
  payout_table_cents  int[] not null,
  playoff_entry_cents int  not null default 4000,
  playoff_percents    numeric[] not null default '{25,20,16,13,10,8,5,3}',
  scoring             jsonb not null default '{}'::jsonb,
  created_at          timestamptz not null default now()
);

create table public.owners (
  id           uuid primary key default gen_random_uuid(),
  owner_code   text not null unique,              -- owner01… (used in fixtures and logs)
  display_name text not null,
  email        text not null unique,
  role         text not null default 'owner' check (role in ('owner', 'commissioner')),
  auth_user_id uuid unique references auth.users (id) on delete set null,
  created_at   timestamptz not null default now()
);

create table public.season_owners (
  season_id bigint not null references public.seasons (id) on delete cascade,
  owner_id  uuid   not null references public.owners (id) on delete cascade,
  primary key (season_id, owner_id)
);

-- ── NFL data ────────────────────────────────────────────────────────────────
create table public.nfl_teams (
  id   text primary key,                           -- abbreviation, e.g. KC
  name text not null
);

create table public.nfl_players (
  id        text primary key,                      -- feed id; team defenses are 'DEF-<team>'
  full_name text not null,
  position  text not null check (position in ('QB', 'RB', 'WR', 'TE', 'K', 'DEF')),
  team_id   text references public.nfl_teams (id),
  active    boolean not null default true,
  updated_at timestamptz not null default now()
);
create index nfl_players_position_idx on public.nfl_players (position) where active;

create table public.weeks (
  id           bigint generated always as identity primary key,
  season_id    bigint not null references public.seasons (id) on delete cascade,
  kind         text not null check (kind in ('regular', 'playoff')),
  number       int  not null,                      -- week 1–18, or playoff round 1–4
  label        text not null,                      -- 'Week 4', 'Wild Card', …
  status       text not null default 'open'
               check (status in ('open', 'provisional', 'final', 'closed')),
  finalized_at timestamptz,
  unique (season_id, kind, number)
);

create table public.nfl_games (
  id        text primary key,                      -- feed game id
  week_id   bigint not null references public.weeks (id) on delete cascade,
  home_team text not null references public.nfl_teams (id),
  away_team text not null references public.nfl_teams (id),
  kickoff   timestamptz not null,
  status    text not null default 'scheduled' check (status in ('scheduled', 'in_progress', 'final')),
  home_score int,
  away_score int
);
create index nfl_games_week_idx on public.nfl_games (week_id);

create table public.player_week_stats (
  week_id    bigint not null references public.weeks (id) on delete cascade,
  player_id  text   not null references public.nfl_players (id),
  stats      jsonb  not null,                      -- raw line + scoring plays with yardage
  points     numeric not null,
  source     text   not null,
  updated_at timestamptz not null default now(),
  primary key (week_id, player_id)
);

create table public.stat_overrides (
  id         bigint generated always as identity primary key,
  week_id    bigint not null references public.weeks (id) on delete cascade,
  player_id  text   not null references public.nfl_players (id),
  points     numeric not null,
  reason     text   not null,
  author_id  uuid   not null references public.owners (id),
  created_at timestamptz not null default now()
);

-- ── Lineups ─────────────────────────────────────────────────────────────────
create table public.lineups (
  id         bigint generated always as identity primary key,
  week_id    bigint not null references public.weeks (id) on delete cascade,
  owner_id   uuid   not null references public.owners (id) on delete cascade,
  updated_at timestamptz not null default now(),
  unique (week_id, owner_id)
);

create table public.lineup_picks (
  lineup_id  bigint not null references public.lineups (id) on delete cascade,
  slot       text   not null check (slot in ('QB', 'RB1', 'RB2', 'WR1', 'WR2', 'WR3', 'K', 'DEF')),
  player_id  text   not null references public.nfl_players (id),
  is_doubled boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (lineup_id, slot),
  unique (lineup_id, player_id)
);
-- At most one doubled pick per lineup.
create unique index lineup_picks_one_double on public.lineup_picks (lineup_id) where is_doubled;

-- ── Results and money ───────────────────────────────────────────────────────
create table public.week_results (
  week_id      bigint not null references public.weeks (id) on delete cascade,
  owner_id     uuid   not null references public.owners (id) on delete cascade,
  points       numeric not null,
  place        int    not null,
  payout_cents int    not null,
  computed_at  timestamptz not null default now(),
  primary key (week_id, owner_id)
);

create table public.ledger_entries (
  id         bigint generated always as identity primary key,
  season_id  bigint not null references public.seasons (id) on delete cascade,
  owner_id   uuid   not null references public.owners (id) on delete cascade,
  week_id    bigint references public.weeks (id) on delete cascade,
  kind       text   not null check (kind in ('fee', 'winnings', 'adjustment')),
  cents      int    not null,                      -- fees negative, winnings positive
  note       text,
  created_at timestamptz not null default now()
);
create index ledger_entries_owner_idx on public.ledger_entries (season_id, owner_id);

create table public.audit_log (
  id         bigint generated always as identity primary key,
  actor_id   uuid references public.owners (id),
  action     text not null,
  detail     jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- ── Helpers ─────────────────────────────────────────────────────────────────
create function public.current_owner_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from public.owners where auth_user_id = auth.uid()
$$;

create function public.is_commissioner() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.owners where auth_user_id = auth.uid() and role = 'commissioner')
$$;

-- A pick is open until its player's game kicks off. Players on bye (no game) stay open.
create function public.pick_is_open(p_lineup_id bigint, p_player_id text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select g.kickoff > now()
    from public.lineups l
    join public.nfl_players p on p.id = p_player_id
    join public.nfl_games g
      on g.week_id = l.week_id and p.team_id in (g.home_team, g.away_team)
    where l.id = p_lineup_id
    limit 1
  ), true)
$$;

-- Link a login to its owner row by email on first sign-in.
create function public.link_owner_on_signup() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.owners set auth_user_id = new.id
  where lower(email) = lower(new.email) and auth_user_id is null;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.link_owner_on_signup();

-- ── Row-level security ──────────────────────────────────────────────────────
-- Everyone in the league can read everything (lineups are visible as soon as they are saved).
-- Owners write only their own lineups, and only picks whose player has not kicked off.
-- Everything else is written by the commissioner or by server jobs using the service role.
do $$
declare t text;
begin
  foreach t in array array[
    'seasons', 'owners', 'season_owners', 'nfl_teams', 'nfl_players', 'weeks', 'nfl_games',
    'player_week_stats', 'stat_overrides', 'lineups', 'lineup_picks', 'week_results',
    'ledger_entries', 'audit_log'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy "league members read" on public.%I for select to authenticated
         using (public.current_owner_id() is not null)', t);
    execute format(
      'create policy "commissioner writes" on public.%I for all to authenticated
         using (public.is_commissioner()) with check (public.is_commissioner())', t);
  end loop;
end $$;

create policy "owners create own lineup" on public.lineups for insert to authenticated
  with check (owner_id = public.current_owner_id());

create policy "owners edit own open picks" on public.lineup_picks for all to authenticated
  using (
    exists (select 1 from public.lineups l where l.id = lineup_id and l.owner_id = public.current_owner_id())
    and public.pick_is_open(lineup_id, player_id)
  )
  with check (
    exists (select 1 from public.lineups l where l.id = lineup_id and l.owner_id = public.current_owner_id())
    and public.pick_is_open(lineup_id, player_id)
  );

-- ── 2026 season ─────────────────────────────────────────────────────────────
insert into public.seasons (year, payout_table_cents)
values (2026, '{4000,2800,2200,1700,1300}');
