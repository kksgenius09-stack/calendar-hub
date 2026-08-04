import { NextResponse } from "next/server";
import { sealTokens } from "@/app/lib/google-oauth";
import { saveConnection } from "@/app/lib/connection-store";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { providerToken?: string; providerRefreshToken?: string; email?: string };
    if (!body.providerToken) return NextResponse.json({ error: "google_token_required" }, { status: 400 });
    const encrypted = await sealTokens({
      access_token: body.providerToken,
      refresh_token: body.providerRefreshToken || undefined,
      expires_at: Date.now() + 55 * 60 * 1000,
    });
    await saveConnection("google", encrypted, body.email || "Google");
    return NextResponse.json({ connected: true });
  } catch (error) {
    if (error instanceof Error && error.message === "AUTH_REQUIRED") return NextResponse.json({ error: "auth_required" }, { status: 401 });
    return NextResponse.json({ error: "google_link_failed" }, { status: 400 });
  }
}
