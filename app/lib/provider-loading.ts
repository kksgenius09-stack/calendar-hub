export type CalendarProvider = "icloud" | "google" | "daou";

export type ProviderCalendar = {
  id: string;
  name: string;
  color: string;
  primary?: boolean;
  selected?: boolean;
  source: CalendarProvider;
};

export type ProviderEvent = {
  id: string;
  calendarId: string;
  source: CalendarProvider;
  start?: string;
  [key: string]: unknown;
};

export type ProviderData = {
  connected: boolean;
  configured?: boolean;
  calendars?: Omit<ProviderCalendar, "source">[];
  events?: Omit<ProviderEvent, "source">[];
};

export type ProviderResult =
  | { source: CalendarProvider; kind: "success"; data: ProviderData }
  | { source: CalendarProvider; kind: "failure" };

export type ProviderState = {
  connected: Record<CalendarProvider, boolean>;
  configured: Record<CalendarProvider, boolean>;
  calendars: ProviderCalendar[];
  events: ProviderEvent[];
};

export function mergeProviderResults(previous: ProviderState, results: ProviderResult[]): ProviderState {
  const next: ProviderState = {
    connected: { ...previous.connected },
    configured: { ...previous.configured },
    calendars: [...previous.calendars],
    events: [...previous.events],
  };

  for (const result of results) {
    if (result.kind === "failure") continue;

    const { source, data } = result;
    next.connected[source] = Boolean(data.connected);
    if (typeof data.configured === "boolean") next.configured[source] = data.configured;

    // A reconnect-required response changes status without wiping viewable data.
    if (data.connected) {
      next.calendars = next.calendars.filter(calendar => calendar.source !== source)
        .concat((data.calendars ?? []).map(calendar => ({ ...calendar, source })));
      next.events = next.events.filter(event => event.source !== source)
        .concat((data.events ?? []).filter(event => event.start).map(event => ({ ...event, source }) as ProviderEvent));
    }
  }

  return next;
}
