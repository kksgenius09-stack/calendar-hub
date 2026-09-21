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
  const normalize = (value: string) => value
    .normalize("NFKC")
    .toLocaleLowerCase("ko-KR")
    .replace(/[^\p{L}\p{N}]/gu, "");
  const terms = query.trim().split(/\s+/).map(normalize).filter(Boolean);
  if (normalize(query).length < 2) return [];
  const seen = new Set<string>();
  return events
    .filter(event => {
      const haystack = normalize(`${event.title}${event.calendarName || ""}`);
      return terms.every(term => haystack.includes(term));
    })
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
