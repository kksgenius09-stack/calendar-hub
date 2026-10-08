import { NextResponse } from "next/server";
import { fetchNbaTeams, NBA_TEAM_NAME_KO } from "@/app/lib/sports/balldontlie";

export async function GET() {
  try {
    const teams = await fetchNbaTeams();
    const withKo = teams.map((team) => ({ ...team, name_ko: NBA_TEAM_NAME_KO[team.id] ?? team.full_name }));
    return NextResponse.json({ teams: withKo });
  } catch {
    return NextResponse.json({ teams: [], error: "NBA 팀 목록을 불러오지 못했어요." }, { status: 502 });
  }
}
