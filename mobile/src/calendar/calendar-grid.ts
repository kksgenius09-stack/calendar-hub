import type { CalendarEvent } from "../api/calendar-client";

export type CalendarDay = { date: Date; key: string; currentMonth: boolean; today: boolean; events: CalendarEvent[] };

export function dayKey(date: Date) {
  const y = date.getFullYear(); const m = String(date.getMonth() + 1).padStart(2, "0"); const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
export function eventDateKey(value: string, timeZone = "Asia/Seoul") {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(value));
  return `${parts.find((p) => p.type === "year")?.value}-${parts.find((p) => p.type === "month")?.value}-${parts.find((p) => p.type === "day")?.value}`;
}

function previousDay(key: string) {
  const [y, m, d] = key.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() - 1);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

export function inclusiveEventEndKey(event: CalendarEvent) {
  const startKey = eventDateKey(event.start);
  const endKey = eventDateKey(event.end || event.start);
  return event.allDay && endKey > startKey ? previousDay(endKey) : endKey;
}

export function eventOccursOnDate(event: CalendarEvent, key: string) {
  const startKey = eventDateKey(event.start);
  const endKey = inclusiveEventEndKey(event);
  return key >= startKey && key <= endKey;
}

export function monthLabel(date: Date) { return `${date.getFullYear()}년 ${date.getMonth() + 1}월`; }

export function monthDays(month: Date, events: CalendarEvent[], now = new Date()): CalendarDay[] {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const start = new Date(first); start.setDate(1 - first.getDay());
  return Array.from({ length: 42 }, (_, index) => { const date = new Date(start); date.setDate(start.getDate() + index); const key = dayKey(date); return { date, key, currentMonth: date.getMonth() === month.getMonth(), today: key === dayKey(now), events: events.filter((event) => eventOccursOnDate(event, key)) }; });
}

export function eventsForDay(events: CalendarEvent[], key: string) { return events.filter((event) => eventOccursOnDate(event, key)); }
