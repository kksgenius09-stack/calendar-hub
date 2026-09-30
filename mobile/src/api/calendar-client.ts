import { getSession, supabase } from "../auth/session";
import { env } from "../config/env";

export type Source = "google" | "icloud" | "daou";
export type CalendarChoice = { id: string; name: string; color?: string; primary?: boolean; selected?: boolean };
export type CalendarEvent = {
  id: string; providerEventId?: string; repeatSeriesId?: string; resourceUrl?: string;
  calendarId: string; calendarName?: string; calendarColor?: string; title: string;
  description?: string;
  start: string; end: string; allDay: boolean; recurrence?: string; source: Source;
};
export type CalendarResponse = { connected: boolean; configured?: boolean; calendars: CalendarChoice[]; events: CalendarEvent[] };
export type EventInput = Omit<Partial<CalendarEvent>, "id" | "source"> & { source: Source; calendarId: string; title: string; start: string; end: string; allDay: boolean; idempotencyKey?: string };

export class CalendarApiError extends Error {
  readonly status: number; readonly code?: string; readonly kind: "auth" | "reconnect" | "network" | "temporary" | "permission" | "unknown";
  constructor(status: number, code?: string) {
    const reconnect = code === "google_reconnect_required" || code === "reconnect_required";
    const kind = status === 401 || code === "not_authenticated" ? "auth" : reconnect ? "reconnect" : status === 403 ? "permission" : status === 0 ? "network" : status >= 500 || code === "temporary_error" ? "temporary" : "unknown";
    super(kind === "auth" ? "로그인이 필요해요." : kind === "reconnect" ? "다시 연결이 필요해요." : kind === "network" ? "네트워크 연결을 확인해 주세요." : kind === "temporary" ? "잠시 후 다시 시도해 주세요." : kind === "permission" ? "이 캘린더에 대한 권한이 없어요." : "캘린더 요청을 처리하지 못했어요.");
    this.name = "CalendarApiError"; this.status = status; this.code = code; this.kind = kind;
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

const inFlight = new Map<string, Promise<unknown>>();
function once<T>(key: string, action: () => Promise<T>): Promise<T> {
  const current = inFlight.get(key) as Promise<T> | undefined;
  if (current) return current;
  const task = action().finally(() => inFlight.delete(key));
  inFlight.set(key, task);
  return task;
}

export function createCalendarClient() {
  return {
    async list(source: Source, range?: { from?: string; to?: string }) {
      const query = new URLSearchParams(); if (range?.from) query.set("from", range.from); if (range?.to) query.set("to", range.to);
      return request<CalendarResponse>(`${paths[source]}${query.size ? `?${query}` : ""}`);
    },
    async create(input: EventInput) { const key = input.idempotencyKey ?? `${input.source}:${input.calendarId}:${input.start}:${input.end}:${input.title}`; return once(`create:${key}`, () => request<{ saved: true; providerEventId?: string; resourceUrl?: string }>(paths[input.source], { method: "POST", body: JSON.stringify(input) })); },
    async update(input: EventInput) { return once(`update:${input.source}:${input.providerEventId ?? input.resourceUrl ?? input.calendarId}`, () => request<{ saved: true }>(paths[input.source], { method: "PATCH", body: JSON.stringify(input) })); },
    async remove(input: Pick<EventInput, "source" | "calendarId"> & { providerEventId?: string; resourceUrl?: string; repeatSeriesId?: string; scope?: "single" | "all" }) { return once(`remove:${input.source}:${input.providerEventId ?? input.resourceUrl ?? input.calendarId}:${input.scope ?? "single"}`, () => request<{ deleted: true }>(paths[input.source], { method: "DELETE", body: JSON.stringify(input) })); },
  };
}

export const calendarClient = createCalendarClient();
