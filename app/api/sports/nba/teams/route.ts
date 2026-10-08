import { NextResponse } from "next/server";
import { fetchNbaTeams } from "@/app/lib/sports/balldontlie";

export async function GET() {
  try {
    const teams = await fetchNbaTeams();
    return NextResponse.json({ teams });
  } catch {
    return NextResponse.json({ teams: [], error: "NBA 팀 목록을 불러오지 못했어요." }, { status: 502 });
  }
}
