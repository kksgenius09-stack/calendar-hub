import { getSession, supabase } from "../auth/session";
import { env } from "../config/env";

export type Source = "google" | "icloud" | "daou";
export type CalendarChoice = { id: string; name: string; color?: string; primary?: boolean; selected?: boolean };
export type CalendarEvent = {
  id: string; providerEventId?: string; repeatSeriesId?: string; resourceUrl?: string;
  calendarId: string; calendarName?: string; calendarColor?: string; title: string;
  start: string; end: string; allDay: boolean; recurrence?: string; source: Source;
};
export type CalendarResponse = { connected: boolean; configured?: boolean; calendars: CalendarChoice[]; events: CalendarEvent[] };
export type EventInput = Omit<Partial<CalendarEvent>, "id" | "source"> & { source: Source; calendarId: string; title: string; start: string; end: string; allDay: boolean };

export class CalendarApiError extends Error {
  readonly status: number; readonly code?: string;
  constructor(status: number, code?: string) {
    super(code === "google_reconnect_required" || code === "reconnect_required" ? "다시 연결이 필요해요." : "캘린더 요청을 처리하지 못했어요.");
    this.name = "CalendarApiError"; this.status = status; this.code = code;
  }
}

const paths: Record<Source, string> = { google: "/api/google/events", icloud: "/api/icloud/events", daou: "/api/caldav/events" };
const base = () => env.apiUrl.replace(/\/$/, "");
async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { session } = await getSession();
  if (!session?.access_token) throw new CalendarApiError(401, "not_authenticated");
  const headers = new Headers(init.headers); headers.set("Authorization", `Bearer ${session.access_token}`);
  if (init.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  let response: Response;
  try { response = await fetch(`${base()}${path}`, { ...init, headers }); }
  catch { throw new CalendarApiError(0, "network_error"); }
  let data: unknown = null; try { data = await response.json(); } catch { /* empty response */ }
  if (!response.ok) throw new CalendarApiError(response.status, typeof data === "object" && data && "error" in data ? String(data.error) : undefined);
  return data as T;
}

export function createCalendarClient() {
  return {
    async list(source: Source, range?: { from?: string; to?: string }) {
      const query = new URLSearchParams(); if (range?.from) query.set("from", range.from); if (range?.to) query.set("to", range.to);
      return request<CalendarResponse>(`${paths[source]}${query.size ? `?${query}` : ""}`);
    },
    async create(input: EventInput) { return request<{ saved: true; providerEventId?: string; resourceUrl?: string }>(paths[input.source], { method: "POST", body: JSON.stringify(input) }); },
    async update(input: EventInput) { return request<{ saved: true }>(paths[input.source], { method: "PATCH", body: JSON.stringify(input) }); },
    async remove(input: Pick<EventInput, "source" | "calendarId"> & { providerEventId?: string; resourceUrl?: string; repeatSeriesId?: string; scope?: "single" | "all" }) { return request<{ deleted: true }>(paths[input.source], { method: "DELETE", body: JSON.stringify(input) }); },
  };
}

export const calendarClient = createCalendarClient();
