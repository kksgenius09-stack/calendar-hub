import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/app/lib/supabase/admin";
import { fetchNbaGamesForTeam, type NbaGame } from "@/app/lib/sports/balldontlie";

const SYNC_WINDOW_DAYS = 45;

function mapStatus(game: NbaGame): "scheduled" | "live" | "final" {
  if (game.status_state === "final" || game.status === "Final") return "final";
  if (game.status_state === "in_progress") return "live";
  return "scheduled";
}

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const admin = getSupabaseAdminClient();
  const { data: followRows, error: followError } = await admin.from("sports_follows").select("team_id").eq("sport", "nba");
  if (followError) return NextResponse.json({ error: followError.message }, { status: 500 });

  const teamIds = Array.from(new Set((followRows ?? []).map((row) => row.team_id)));
  if (!teamIds.length) return NextResponse.json({ synced: 0, teams: 0 });

  const today = new Date();
  const startDate = today.toISOString().slice(0, 10);
  const endDate = new Date(today.getTime() + SYNC_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  let synced = 0;
  const errors: string[] = [];

  for (const teamId of teamIds) {
    try {
      const games = await fetchNbaGamesForTeam(Number(teamId), startDate, endDate);
      const rows = games.map((game) => ({
        id: `nba:${game.id}`,
        sport: "nba",
        team_ids: [String(game.home_team.id), String(game.visitor_team.id)],
        home_team: game.home_team.full_name,
        away_team: game.visitor_team.full_name,
        start_time: game.datetime,
        status: mapStatus(game),
        venue: null,
        updated_at: new Date().toISOString(),
      }));
      if (rows.length) {
        const { error } = await admin.from("sports_events").upsert(rows, { onConflict: "id" });
        if (error) throw error;
        synced += rows.length;
      }
    } catch (error) {
      errors.push(`team ${teamId}: ${error instanceof Error ? error.message : "unknown error"}`);
    }
  }

  return NextResponse.json({ synced, teams: teamIds.length, errors: errors.length ? errors : undefined });
}
