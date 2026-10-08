-- Sports schedule feature: follow teams + cached schedule events
-- Run this in Supabase Dashboard -> SQL Editor

create table if not exists sports_follows (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  sport text not null,
  team_id text not null,
  team_name text not null,
  created_at timestamptz not null default now(),
  unique (user_id, sport, team_id)
);

alter table sports_follows enable row level security;

create policy "users can view their own follows" on sports_follows
  for select using (auth.uid() = user_id);

create policy "users can insert their own follows" on sports_follows
  for insert with check (auth.uid() = user_id);

create policy "users can delete their own follows" on sports_follows
  for delete using (auth.uid() = user_id);

create table if not exists sports_events (
  id text primary key,
  sport text not null,
  team_ids text[] not null,
  home_team text not null,
  away_team text not null,
  start_time timestamptz not null,
  status text not null,
  venue text,
  updated_at timestamptz not null default now()
);

create index if not exists sports_events_sport_start_idx on sports_events (sport, start_time);
create index if not exists sports_events_team_ids_idx on sports_events using gin (team_ids);

alter table sports_events enable row level security;

create policy "anyone can read sports events" on sports_events
  for select using (true);

-- Writes to sports_events are done by the cron job using the service role key,
-- which bypasses RLS, so no insert/update/delete policy is needed for regular users.
