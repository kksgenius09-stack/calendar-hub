export type SearchSource = "icloud" | "google" | "daou";

export type SearchableCalendarEvent = {
  id: string;
  source: SearchSource;
  calendarId: string;
  calendarName?: string;
  title: string;
  start: string;
};

export type ExpandedSources = Record<SearchSource, boolean>;

const expandedDefaults: ExpandedSources = { icloud: true, google: true, daou: true };

export function expandSearchYears(years: number[], direction: "past" | "future") {
  const sorted = [...new Set(years)].sort((a, b) => a - b);
  if (sorted.length === 0) return [];
  const next = direction === "past" ? sorted[0] - 1 : sorted[sorted.length - 1] + 1;
  return [...sorted, next].sort((a, b) => a - b);
}

export function searchCalendarEvents<T extends SearchableCalendarEvent>(events: T[], query: string) {
  const needle = query.trim().toLocaleLowerCase("ko-KR");
  if (needle.length < 2) return [];
  const seen = new Set<string>();
  return events
    .filter(event => `${event.title} ${event.calendarName || ""}`.toLocaleLowerCase("ko-KR").includes(needle))
    .filter(event => {
      const key = `${event.source}:${event.calendarId}:${event.id}:${event.start}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
}

export function normalizeExpandedSources(value: unknown): ExpandedSources {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { ...expandedDefaults };
  const saved = value as Partial<ExpandedSources>;
  return {
    icloud: typeof saved.icloud === "boolean" ? saved.icloud : true,
    google: typeof saved.google === "boolean" ? saved.google : true,
    daou: typeof saved.daou === "boolean" ? saved.daou : true,
  };
}
