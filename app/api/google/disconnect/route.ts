import { NextResponse } from "next/server";
import { removeConnection } from "@/app/lib/connection-store";

export async function POST(request: Request) {
  try { await removeConnection("google"); } catch { return NextResponse.json({ error: "auth_required" }, { status: 401 }); }
  const response = NextResponse.redirect(new URL("/", request.url), 303);
  return response;
}
