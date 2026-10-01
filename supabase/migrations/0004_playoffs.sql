-- Playoff contest rosters. Every save appends a version; a round is scored from the latest version
-- saved before that round's last kickoff. Rules are checked in the app (src/lib/playoffs/rules.ts)
-- and versions are written with the service role, so owners get read access only.
create table public.playoff_roster_versions (
  id         bigint generated always as identity primary key,
  season_id  bigint not null references public.seasons (id) on delete cascade,
  owner_id   uuid   not null references public.owners (id) on delete cascade,
  -- {"actives": {"QB": "<player id>", …}, "doubled": "RB1", "reserves": {"R1": {"playerId": …, "used": false}, …}}
  roster     jsonb  not null,
  saved_by   uuid   references public.owners (id),
  saved_at   timestamptz not null default now()
);
create index playoff_roster_versions_latest on public.playoff_roster_versions (season_id, owner_id, saved_at desc);

alter table public.playoff_roster_versions enable row level security;
create policy "league members read" on public.playoff_roster_versions for select to authenticated
  using (public.current_owner_id() is not null);
