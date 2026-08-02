import { NextRequest, NextResponse } from "next/server";
import { googleConfig, googleCookie, openTokens, sealTokens } from "@/app/lib/google-oauth";

type GoogleEvent = {
  id: string;
  summary?: string;
  start?: { date?: string; dateTime?: string };
  end?: { date?: string; dateTime?: string };
};

type GoogleCalendar = {
  id: string;
  summary?: string;
  primary?: boolean;
  selected?: boolean;
  backgroundColor?: string;
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
    const authorization = { authorization: `Bearer ${tokens.access_token}` };
    const listResponse = await fetch(
      "https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=250",
      { headers: authorization },
    );
    if (!listResponse.ok) throw new Error("Calendar list request failed");
    const list = await listResponse.json() as { items?: GoogleCalendar[] };
    const calendars = list.items ?? [];
    const eventGroups = await Promise.all(calendars.map(async (calendar) => {
      const calendarResponse = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendar.id)}/events?${params}`,
        { headers: authorization },
      );
      if (!calendarResponse.ok) return [];
      const data = await calendarResponse.json() as { items?: GoogleEvent[] };
      return (data.items ?? []).map((event) => ({
        id: `${calendar.id}:${event.id}`,
        calendarId: calendar.id,
        calendarName: calendar.summary || "Google 캘린더",
        calendarColor: calendar.backgroundColor || "#e7a938",
        title: event.summary || "제목 없는 일정",
        start: event.start?.dateTime || event.start?.date,
        end: event.end?.dateTime || event.end?.date,
        allDay: Boolean(event.start?.date),
      }));
    }));
    const response = NextResponse.json({
      connected: true,
      configured: true,
      calendars: calendars.map((calendar) => ({
        id: calendar.id,
        name: calendar.summary || "Google 캘린더",
        color: calendar.backgroundColor || "#e7a938",
        primary: Boolean(calendar.primary),
        selected: calendar.selected !== false,
      })),
      events: eventGroups.flat(),
    });
    if (refreshed) response.cookies.set(googleCookie.name, await sealTokens(tokens), googleCookie.options);
    return response;
  } catch {
    const response = NextResponse.json({ connected: false, events: [], error: "reconnect_required" }, { status: 401 });
    response.cookies.delete(googleCookie.name);
    return response;
  }
}
