-- Adds a per-user custom color for each followed sports team.
-- Run this in Supabase Dashboard -> SQL Editor (after the first sports migration)

alter table sports_follows add column if not exists color text;
