import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/app/lib/supabase/server";
import { listFollows } from "@/app/lib/sports/follows";
import type { SportsEventRow } from "@/app/lib/sports/types";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  if (!from || !to) return NextResponse.json({ events: [] as SportsEventRow[], error: "INVALID_RANGE" }, { status: 400 });

  try {
    const follows = await listFollows();
    if (!follows.length) return NextResponse.json({ events: [] as SportsEventRow[] });

    const teamIds = follows.map((follow) => follow.teamId);
    const supabase = await getSupabaseServerClient();
    const { data, error } = await supabase
      .from("sports_events")
      .select("id,sport,team_ids,home_team,away_team,start_time,status,venue")
      .overlaps("team_ids", teamIds)
      .gte("start_time", from)
      .lte("start_time", to)
      .order("start_time", { ascending: true });
    if (error) throw error;
    return NextResponse.json({ events: (data ?? []) as SportsEventRow[] });
  } catch {
    return NextResponse.json({ events: [] as SportsEventRow[], error: "AUTH_REQUIRED" }, { status: 401 });
  }
}
