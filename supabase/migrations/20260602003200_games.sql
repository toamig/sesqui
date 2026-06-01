-- Sesqui online -- Layer 2 schema: persisted games.
--
-- Run this once in the Supabase dashboard (SQL Editor -> New query -> paste ->
-- Run). It creates the table that makes online games refresh-proof and enables
-- spectators. Layer 1 (live move relay) keeps using Realtime Broadcast; this
-- table is the durable "save file" that clients hydrate from on load.
--
-- Trust model: there are no accounts yet, so anyone who knows a room's
-- (unguessable, 5-char) code may read and write that room. This matches Layer
-- 1's client-trusted design. At Layer 3 (auth + ratings) these policies tighten
-- to per-user ownership and server-side move validation.

create table if not exists public.games (
  -- Room code (the share code). One row per game.
  code         text primary key,
  -- Monotonic generation id. Distinguishes successive games (rematches) in the
  -- same room so stale broadcast moves are ignored. All clients read it here.
  game_id      bigint      not null,
  -- Full GameState snapshot as JSON (board, current, turn, counters, winner...).
  state        jsonb       not null,
  -- Number of atomic actions applied. Monotonic; guards stale writes.
  seq          integer     not null default 0,
  -- Which colour the host plays ('V' or 'H'); the guest takes the other.
  host_color   text        not null default 'V',
  -- Opaque per-browser tokens holding each seat, so a refreshing player
  -- reclaims their own colour and a third visitor becomes a spectator.
  v_token      text,
  h_token      text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Touch updated_at on every write (useful for "abandon old rooms" cleanup later).
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists games_touch_updated_at on public.games;
create trigger games_touch_updated_at
  before update on public.games
  for each row execute function public.touch_updated_at();

-- Row-Level Security: enabled, with permissive policies for the anon role.
-- (RLS must be ON or the anon key is blocked entirely; these policies open it
-- back up at the room-code granularity, which is the Layer 2 trust model.)
alter table public.games enable row level security;

drop policy if exists "anon can read games"   on public.games;
drop policy if exists "anon can insert games" on public.games;
drop policy if exists "anon can update games" on public.games;

create policy "anon can read games"   on public.games for select using (true);
create policy "anon can insert games" on public.games for insert with check (true);
create policy "anon can update games" on public.games for update using (true) with check (true);
