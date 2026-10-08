import { NextResponse } from "next/server";
import { fetchLckTeams } from "@/app/lib/sports/lolesports";

export async function GET() {
  try {
    const teams = await fetchLckTeams();
    return NextResponse.json({ teams });
  } catch {
    return NextResponse.json({ teams: [], error: "LCK 팀 목록을 불러오지 못했어요." }, { status: 502 });
  }
}
