import { NextRequest, NextResponse } from "next/server";
import { googleConfig, googleCookie, openTokens, sealTokens } from "@/app/lib/google-oauth";

type GoogleEvent = {
  id: string;
  summary?: string;
  start?: { date?: string; dateTime?: string };
  end?: { date?: string; dateTime?: string };
};

export async function GET(request: NextRequest) {
  const sealed = request.cookies.get(googleCookie.name)?.value;
  const configured = Boolean(
    process.env.GOOGLE_CLIENT_ID &&
    process.env.GOOGLE_CLIENT_SECRET &&
    process.env.GOOGLE_TOKEN_SECRET,
  );
  if (!sealed) return NextResponse.json({ connected: false, configured, events: [] });

  try {
    const tokens = await openTokens(sealed);
    let refreshed = false;
    if (tokens.expires_at < Date.now() + 60_000) {
      if (!tokens.refresh_token) throw new Error("Refresh token missing");
      const config = googleConfig(new URL(request.url).origin);
      const refreshResponse = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: config.clientId,
          client_secret: config.clientSecret,
          refresh_token: tokens.refresh_token,
          grant_type: "refresh_token",
        }),
      });
      if (!refreshResponse.ok) throw new Error("Token refresh failed");
      const nextToken = await refreshResponse.json() as { access_token: string; expires_in: number };
      tokens.access_token = nextToken.access_token;
      tokens.expires_at = Date.now() + nextToken.expires_in * 1000;
      refreshed = true;
    }

    const now = new Date();
    const rangeStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    const rangeEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 2, 1));
    const params = new URLSearchParams({
      timeMin: rangeStart.toISOString(),
      timeMax: rangeEnd.toISOString(),
      singleEvents: "true",
      orderBy: "startTime",
      maxResults: "250",
    });
    const calendarResponse = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
      { headers: { authorization: `Bearer ${tokens.access_token}` } },
    );
    if (!calendarResponse.ok) throw new Error("Calendar request failed");
    const calendar = await calendarResponse.json() as { items?: GoogleEvent[] };
    const response = NextResponse.json({
      connected: true,
      configured: true,
      events: (calendar.items ?? []).map((event) => ({
        id: event.id,
        title: event.summary || "제목 없는 일정",
        start: event.start?.dateTime || event.start?.date,
        end: event.end?.dateTime || event.end?.date,
        allDay: Boolean(event.start?.date),
      })),
    });
    if (refreshed) response.cookies.set(googleCookie.name, await sealTokens(tokens), googleCookie.options);
    return response;
  } catch {
    const response = NextResponse.json({ connected: false, events: [], error: "reconnect_required" }, { status: 401 });
    response.cookies.delete(googleCookie.name);
    return response;
  }
}
