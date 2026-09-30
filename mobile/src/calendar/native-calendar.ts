import * as Calendar from "expo-calendar/legacy";
import type { CalendarChoice, CalendarEvent, Source } from "../api/calendar-client";

export type NativeCalendarChoice = CalendarChoice & { source: Source; allowsModifications?: boolean; accountName?: string };

function sourceFor(calendar: Calendar.Calendar) : Source {
  const text = `${calendar.source?.type ?? ""} ${calendar.source?.name ?? ""} ${calendar.title}`.toLowerCase();
  if (text.includes("google") || text.includes("gmail") || text.includes("구글")) return "google";
  if (text.includes("icloud") || text.includes("apple") || text.includes("mobileme")) return "icloud";
  return "daou";
}

export async function getNativeCalendars(): Promise<NativeCalendarChoice[]> {
  const permission = await Calendar.getCalendarPermissionsAsync();
  if (permission.status !== "granted") return [];
  const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
  calendars.forEach((calendar) => console.log("[ON] calendar", calendar.title, "| source.type=", calendar.source?.type, "| source.name=", calendar.source?.name, "-> classified as", sourceFor(calendar)));
  return calendars.map((calendar) => ({
    id: calendar.id,
    name: calendar.title,
    color: calendar.color ?? undefined,
    primary: Boolean(calendar.isPrimary),
    selected: true,
    source: sourceFor(calendar),
    allowsModifications: calendar.allowsModifications !== false,
    accountName: calendar.source?.name,
  }));
}

export async function getNativeEvents(calendars: NativeCalendarChoice[], from: Date, to: Date): Promise<CalendarEvent[]> {
  const result: CalendarEvent[] = [];
  for (const calendar of calendars) {
    const events = await Calendar.getEventsAsync([calendar.id], from, to);
    for (const event of events) {
      result.push({
        id: event.id,
        providerEventId: event.id,
        calendarId: calendar.id,
        calendarName: calendar.name,
        calendarColor: calendar.color,
        title: event.title || "(제목 없음)",
        description: event.notes || undefined,
        start: new Date(event.startDate).toISOString(),
        end: new Date(event.endDate).toISOString(),
        allDay: Boolean(event.allDay),
        source: calendar.source,
        recurrence: event.recurrenceRule?.frequency ? `RRULE:FREQ=${String(event.recurrenceRule.frequency).toUpperCase()}` : undefined,
      });
    }
  }
  return result;
}

export type NativeRecurrence = "daily" | "weekly" | "monthly";
type NativeEventInput = { title: string; description?: string; start: Date; end: Date; allDay: boolean; location?: string; url?: string; recurrence?: NativeRecurrence };

function recurrenceRuleFor(recurrence?: NativeRecurrence) {
  return recurrence ? { frequency: recurrence as Calendar.Frequency } : undefined;
}

export async function createNativeEvent(calendarId: string, input: NativeEventInput) {
  return Calendar.createEventAsync(calendarId, { title: input.title, notes: input.description, startDate: input.start, endDate: input.end, allDay: input.allDay, location: input.location, url: input.url, recurrenceRule: recurrenceRuleFor(input.recurrence) });
}

export async function updateNativeEvent(eventId: string, input: NativeEventInput) {
  return Calendar.updateEventAsync(eventId, { title: input.title, notes: input.description, startDate: input.start, endDate: input.end, allDay: input.allDay, location: input.location, url: input.url, recurrenceRule: recurrenceRuleFor(input.recurrence) });
}

export async function deleteNativeEvent(eventId: string) { return Calendar.deleteEventAsync(eventId); }
