import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/app/lib/supabase/admin";
import { fetchLckSchedule, type LolEvent } from "@/app/lib/sports/lolesports";

function mapStatus(state: LolEvent["state"]): "scheduled" | "live" | "final" {
  if (state === "completed") return "final";
  if (state === "inProgress") return "live";
  return "scheduled";
}

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const admin = getSupabaseAdminClient();
  const { data: followRows, error: followError } = await admin.from("sports_follows").select("team_id").eq("sport", "esports");
  if (followError) return NextResponse.json({ error: followError.message }, { status: 500 });

  const followedCodes = new Set((followRows ?? []).map((row) => row.team_id));
  if (!followedCodes.size) return NextResponse.json({ synced: 0, teams: 0 });

  // Walk a few pages so near-term upcoming matches (which sit past "today") aren't missed.
  const rows: ReturnType<typeof buildRow>[] = [];
  let pageToken: string | undefined;
  for (let page = 0; page < 3; page++) {
    const { events, older } = await fetchLckSchedule(pageToken);
    for (const event of events) {
      const match = event.match;
      if (!match || match.teams.length < 2) continue;
      const [teamA, teamB] = match.teams;
      if (!followedCodes.has(teamA.code) && !followedCodes.has(teamB.code)) continue;
      rows.push(buildRow(event, match, teamA, teamB));
    }
    if (!older) break;
    pageToken = older;
  }

  if (!rows.length) return NextResponse.json({ synced: 0, teams: followedCodes.size });
  const { error } = await admin.from("sports_events").upsert(rows, { onConflict: "id" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ synced: rows.length, teams: followedCodes.size });
}

function buildRow(event: LolEvent, match: NonNullable<LolEvent["match"]>, teamA: { code: string; name: string }, teamB: { code: string; name: string }) {
  return {
    id: `esports:${match.id}`,
    sport: "esports",
    team_ids: [teamA.code, teamB.code],
    home_team: teamA.name,
    away_team: teamB.name,
    start_time: event.startTime,
    status: mapStatus(event.state),
    venue: null,
    updated_at: new Date().toISOString(),
  };
}
