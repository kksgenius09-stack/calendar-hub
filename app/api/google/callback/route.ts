import { NextRequest, NextResponse } from "next/server";
import { googleConfig, sealTokens } from "@/app/lib/google-oauth";
import { requireOnCalUser, saveConnection } from "@/app/lib/connection-store";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const origin = url.origin;
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const savedState = request.cookies.get("oncal_google_state")?.value;

  if (!code || !state || !savedState || state !== savedState) {
    return NextResponse.redirect(`${origin}/?google=failed`);
  }

  try {
    const user = await requireOnCalUser();
    const config = googleConfig(origin);
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: config.clientId,
        client_secret: config.clientSecret,
        redirect_uri: config.redirectUri,
        grant_type: "authorization_code",
      }),
    });
    if (!tokenResponse.ok) throw new Error("Token exchange failed");
    const token = await tokenResponse.json() as {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
    };
    const sealed = await sealTokens({
      access_token: token.access_token,
      refresh_token: token.refresh_token,
      expires_at: Date.now() + token.expires_in * 1000,
    });
    await saveConnection("google", sealed, user.email || "Google");
    const response = NextResponse.redirect(`${origin}/?google=connected`);
    response.cookies.delete("oncal_google_state");
    return response;
  } catch {
    return NextResponse.redirect(`${origin}/?google=failed`);
  }
}
