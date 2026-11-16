-- Banter: a league-wide chat. Text and emoji only.

create table public.banter_messages (
  id         bigint generated always as identity primary key,
  owner_id   uuid   not null references public.owners (id) on delete cascade,
  body       text   not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now(),
  edited_at  timestamptz,
  deleted_at timestamptz,               -- soft delete: the message shows as "deleted"
  deleted_by uuid references public.owners (id)
);
create index banter_messages_created on public.banter_messages (created_at desc);

create table public.banter_reactions (
  message_id bigint not null references public.banter_messages (id) on delete cascade,
  owner_id   uuid   not null references public.owners (id) on delete cascade,
  emoji      text   not null check (emoji in ('👍', '😂', '🔥', '😬', '🏈')),
  created_at timestamptz not null default now(),
  primary key (message_id, owner_id, emoji)
);
-- Deleted reactions must carry the whole row in real-time events.
alter table public.banter_reactions replica identity full;

-- Per owner: when they last opened Banter (for the unread count).
create table public.banter_reads (
  owner_id     uuid primary key references public.owners (id) on delete cascade,
  last_read_at timestamptz not null default now()
);

-- ── Row-level security ──────────────────────────────────────────────────────
alter table public.banter_messages enable row level security;
alter table public.banter_reactions enable row level security;
alter table public.banter_reads enable row level security;

create policy "league members read" on public.banter_messages for select to authenticated
  using (public.current_owner_id() is not null);
create policy "owners post as themselves" on public.banter_messages for insert to authenticated
  with check (owner_id = public.current_owner_id() and deleted_at is null and edited_at is null);
create policy "owners edit own, commissioner removes any" on public.banter_messages for update to authenticated
  using (owner_id = public.current_owner_id() or public.is_commissioner())
  with check (owner_id = public.current_owner_id() or public.is_commissioner());

create policy "league members read" on public.banter_reactions for select to authenticated
  using (public.current_owner_id() is not null);
create policy "owners react as themselves" on public.banter_reactions for insert to authenticated
  with check (owner_id = public.current_owner_id());
create policy "owners remove own reactions" on public.banter_reactions for delete to authenticated
  using (owner_id = public.current_owner_id());

create policy "own read marker" on public.banter_reads for all to authenticated
  using (owner_id = public.current_owner_id()) with check (owner_id = public.current_owner_id());

-- ── Real-time updates ───────────────────────────────────────────────────────
alter publication supabase_realtime add table public.banter_messages, public.banter_reactions;
