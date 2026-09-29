import type { CalendarEvent } from "../api/calendar-client";

export type CalendarDay = { date: Date; key: string; currentMonth: boolean; today: boolean; events: CalendarEvent[] };

export function dayKey(date: Date) {
  const y = date.getFullYear(); const m = String(date.getMonth() + 1).padStart(2, "0"); const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function monthLabel(date: Date) { return `${date.getFullYear()}년 ${date.getMonth() + 1}월`; }

export function monthDays(month: Date, events: CalendarEvent[], now = new Date()): CalendarDay[] {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const start = new Date(first); start.setDate(1 - first.getDay());
  const byDay = new Map<string, CalendarEvent[]>();
  for (const event of events) { const key = event.start.slice(0, 10); byDay.set(key, [...(byDay.get(key) ?? []), event]); }
  return Array.from({ length: 42 }, (_, index) => { const date = new Date(start); date.setDate(start.getDate() + index); const key = dayKey(date); return { date, key, currentMonth: date.getMonth() === month.getMonth(), today: key === dayKey(now), events: byDay.get(key) ?? [] }; });
}

export function eventsForDay(events: CalendarEvent[], key: string) { return events.filter((event) => event.start.slice(0, 10) === key); }
