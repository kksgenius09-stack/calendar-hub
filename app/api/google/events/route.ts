import { NextRequest, NextResponse } from "next/server";
import { googleConfig, openTokens, sealTokens, type GoogleTokens } from "@/app/lib/google-oauth";
import { runtimeEnv } from "@/app/lib/runtime-env";
import { loadConnection, saveConnection } from "@/app/lib/connection-store";
import { providerEventFailure } from "@/app/lib/provider-event-failures";

type GoogleCalendar = { id: string; summary?: string; primary?: boolean; selected?: boolean; backgroundColor?: string };
type GoogleEvent = { id: string; summary?: string; recurrence?: string[]; recurringEventId?:string; start?: { date?: string; dateTime?: string }; end?: { date?: string; dateTime?: string } };

async function access(request: NextRequest) {
  const sealed = (await loadConnection("google"))?.encrypted;
  if (!sealed) throw new Error("NOT_CONNECTED");
  let tokens: GoogleTokens;
  try {
    tokens = await openTokens(sealed);
  } catch (error) {
    if (error instanceof Error && error.message === "GOOGLE_TOKEN_SECRET is not configured") throw error;
    throw new Error("NOT_CONNECTED");
  }
  let refreshed = false;
  if (tokens.expires_at < Date.now() + 60_000) {
    if (!tokens.refresh_token) throw new Error("NOT_CONNECTED");
    const config = googleConfig(new URL(request.url).origin);
    const response = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, refresh_token: tokens.refresh_token, grant_type: "refresh_token" }) });
    if (!response.ok) {
      const data = await response.json().catch(() => ({})) as { error?: string };
      if (data.error === "invalid_grant") throw new Error("NOT_CONNECTED");
      throw new Error("GOOGLE_REFRESH_TEMPORARY");
    }
    const next = await response.json() as { access_token: string; expires_in: number };
    tokens.access_token = next.access_token; tokens.expires_at = Date.now() + next.expires_in * 1000; refreshed = true;
  }
  return { tokens, refreshed, headers: { authorization: `Bearer ${tokens.access_token}`, "content-type": "application/json" } };
}

async function finish(data: unknown, tokens?: GoogleTokens, refreshed?: boolean, status = 200) {
  const response = NextResponse.json(data, { status });
  if (tokens && refreshed) await saveConnection("google", await sealTokens(tokens), "Google");
  return response;
}

async function isGoogleAuthFailure(response: Response) {
  if (response.status === 401) return true;
  if (response.status !== 403) return false;
  try {
    const data = await response.json() as { error?: { errors?: Array<{ reason?: string }> } };
    return (data.error?.errors ?? []).some(({ reason }) =>
      reason === "authError" || reason === "insufficientPermissions" || reason === "insufficientAuthenticationScopes");
  } catch {
    return false;
  }
}

export async function GET(request: NextRequest) {
  const configured = Boolean(runtimeEnv("GOOGLE_CLIENT_ID") && runtimeEnv("GOOGLE_CLIENT_SECRET") && runtimeEnv("CALENDAR_CREDENTIAL_SECRET"));
  try {
    const auth = await access(request);
    const from = request.nextUrl.searchParams.get("from") || new Date(Date.now() - 31 * 86400000).toISOString();
    const to = request.nextUrl.searchParams.get("to") || new Date(Date.now() + 93 * 86400000).toISOString();
    const listResponse = await fetch("https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=250", { headers: auth.headers });
    if (!listResponse.ok) {
      if (await isGoogleAuthFailure(listResponse)) throw new Error("NOT_CONNECTED");
      throw new Error("GOOGLE_LIST_TEMPORARY");
    }
    const list = await listResponse.json() as { items?: GoogleCalendar[] };
    const calendars = list.items ?? [];
    const params = new URLSearchParams({ timeMin: from, timeMax: to, singleEvents: "true", orderBy: "startTime", maxResults: "500" });
    const eventCalendars = calendars.filter(calendar => calendar.selected !== false || calendar.primary);
    const groups = await Promise.all(eventCalendars.map(async calendar => {
      const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendar.id)}/events?${params}`, { headers: auth.headers });
      if (!response.ok) {
        if (await isGoogleAuthFailure(response)) throw new Error("NOT_CONNECTED");
        throw new Error("GOOGLE_EVENTS_TEMPORARY");
      }
      const data = await response.json() as { items?: GoogleEvent[] };
      return (data.items ?? []).map(event => ({ id: `${calendar.id}:${event.id}`, providerEventId: event.id, repeatSeriesId:event.recurringEventId, calendarId: calendar.id, calendarName: calendar.summary || "Google 캘린더", calendarColor: calendar.backgroundColor || "#e7a938", title: event.summary || "제목 없는 일정", start: event.start?.dateTime || event.start?.date, end: event.end?.dateTime || event.end?.date, allDay: Boolean(event.start?.date), recurrence: event.recurrence?.[0]?.replace("RRULE:", "") || "" }));
    }));
    return finish({ connected: true, configured, calendars: calendars.map(c => ({ id: c.id, name: c.summary || "Google 캘린더", color: c.backgroundColor || "#e7a938", primary: Boolean(c.primary), selected: c.selected !== false })), events: groups.flat() }, auth.tokens, auth.refreshed);
  } catch (error) { const failure = providerEventFailure("google", configured, error); return NextResponse.json(failure.body, { status: failure.status }); }
}

function googleBody(body: { title: string; start: string; end: string; allDay: boolean; recurrence?: string; description?:string }) {
  return { summary: body.title, description:body.description, start: body.allDay ? { date: body.start.slice(0, 10) } : { dateTime: body.start }, end: body.allDay ? { date: body.end.slice(0, 10) } : { dateTime: body.end }, ...(body.recurrence ? { recurrence: [`RRULE:${body.recurrence}`] } : {}) };
}

export async function POST(request: NextRequest) {
  try { const auth = await access(request); const body = await request.json(); const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(body.calendarId)}/events`, { method: "POST", headers: auth.headers, body: JSON.stringify(googleBody(body)) }); if (!response.ok) return NextResponse.json({ error: response.status === 403 ? "google_reconnect_required" : "save_failed" }, { status: response.status }); const event=await response.json() as {id?:string}; return finish({ saved: true, providerEventId:event.id }, auth.tokens, auth.refreshed); } catch { return NextResponse.json({ error: "reconnect_required" }, { status: 401 }); }
}
export async function PATCH(request: NextRequest) {
  try { const auth = await access(request); const body = await request.json(); const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(body.calendarId)}/events/${encodeURIComponent(body.providerEventId)}`, { method: "PATCH", headers: auth.headers, body: JSON.stringify(googleBody(body)) }); if (!response.ok) return NextResponse.json({ error: response.status === 403 ? "google_reconnect_required" : "save_failed" }, { status: response.status }); return finish({ saved: true }, auth.tokens, auth.refreshed); } catch { return NextResponse.json({ error: "reconnect_required" }, { status: 401 }); }
}
export async function DELETE(request: NextRequest) {
  try { const auth = await access(request); const body = await request.json(); const eventId=body.scope==="all"&&body.repeatSeriesId?body.repeatSeriesId:body.providerEventId; const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(body.calendarId)}/events/${encodeURIComponent(eventId)}`, { method: "DELETE", headers: auth.headers }); if (!response.ok) return NextResponse.json({ error: "delete_failed" }, { status: response.status }); return finish({ deleted: true }, auth.tokens, auth.refreshed); } catch { return NextResponse.json({ error: "reconnect_required" }, { status: 401 }); }
}
