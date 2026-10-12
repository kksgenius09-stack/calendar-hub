-- Fixes: changing a followed team's color silently failed because RLS had
-- no UPDATE policy on sports_follows, so the upsert's ON CONFLICT DO UPDATE
-- path was rejected for already-followed teams.
-- Run this in Supabase Dashboard -> SQL Editor (after migrations 1 and 2).

create policy "users can update their own follows" on sports_follows
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
