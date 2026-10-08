import { NextResponse } from "next/server";
import { followTeam, listFollows, unfollowTeam } from "@/app/lib/sports/follows";

export async function GET(request: Request) {
  const sport = new URL(request.url).searchParams.get("sport") || undefined;
  try {
    const follows = await listFollows(sport);
    return NextResponse.json({ follows });
  } catch {
    return NextResponse.json({ follows: [], error: "AUTH_REQUIRED" }, { status: 401 });
  }
}

export async function POST(request: Request) {
  try {
    const input = (await request.json()) as { sport?: string; teamId?: string; teamName?: string };
    if (!input.sport?.trim() || !input.teamId?.trim() || !input.teamName?.trim()) {
      return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
    }
    await followTeam(input.sport.trim(), input.teamId.trim(), input.teamName.trim());
    return NextResponse.json({ followed: true });
  } catch {
    return NextResponse.json({ error: "AUTH_REQUIRED" }, { status: 401 });
  }
}

export async function DELETE(request: Request) {
  const url = new URL(request.url);
  const sport = url.searchParams.get("sport");
  const teamId = url.searchParams.get("teamId");
  if (!sport || !teamId) return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
  try {
    await unfollowTeam(sport, teamId);
    return NextResponse.json({ unfollowed: true });
  } catch {
    return NextResponse.json({ error: "AUTH_REQUIRED" }, { status: 401 });
  }
}
