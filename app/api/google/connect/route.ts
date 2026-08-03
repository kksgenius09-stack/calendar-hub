import { NextResponse } from "next/server";
import { googleConfig } from "@/app/lib/google-oauth";
import { requireOnCalUser } from "@/app/lib/connection-store";

export async function GET(request: Request) {
  const origin = new URL(request.url).origin;
  try {
    await requireOnCalUser();
    const config = googleConfig(origin);
    const state = crypto.randomUUID();
    const params = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: config.redirectUri,
      response_type: "code",
      scope: "https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/calendar.events",
      access_type: "offline",
      include_granted_scopes: "true",
      prompt: "consent",
      state,
    });
    const response = NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
    response.cookies.set("oncal_google_state", state, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 600,
    });
    return response;
  } catch {
    return NextResponse.redirect(`${origin}/?google=setup-required`);
  }
}
