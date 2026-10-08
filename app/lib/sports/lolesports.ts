const BASE_URL = "https://esports-api.lolesports.com/persisted/gw";
// Public key used by lolesports.com's own frontend. Not a per-developer secret.
const PUBLIC_API_KEY = "0TvQnueqKa5mxJntVWt0w4LpLfEkrV1Ta8rQBb9Z";

export const LCK_LEAGUE_ID = "98767991310872058";

function headers(): HeadersInit {
  return { "x-api-key": PUBLIC_API_KEY };
}

type LolTeam = { name: string; code: string; image: string };
type LolMatch = {
  id: string;
  teams: (LolTeam & { result?: { outcome: string } })[];
  strategy: { type: string; count: number };
};
type LolEvent = {
  startTime: string;
  state: "unstarted" | "inProgress" | "completed";
  type: string;
  blockName: string;
  league: { name: string; slug: string };
  match?: LolMatch;
};

export async function fetchLckSchedule(pageToken?: string): Promise<{ events: LolEvent[]; older: string | null; newer: string | null }> {
  const params = new URLSearchParams({ hl: "en-US", leagueId: LCK_LEAGUE_ID });
  if (pageToken) params.set("pageToken", pageToken);
  const res = await fetch(`${BASE_URL}/getSchedule?${params.toString()}`, { headers: headers() });
  if (!res.ok) throw new Error(`lolesports schedule fetch failed: ${res.status}`);
  const json = (await res.json()) as { data: { schedule: { events: LolEvent[]; pages: { older: string | null; newer: string | null } } } };
  return { events: json.data.schedule.events, older: json.data.schedule.pages.older, newer: json.data.schedule.pages.newer };
}

export async function fetchLckTeams(): Promise<{ code: string; name: string }[]> {
  const { events } = await fetchLckSchedule();
  const seen = new Map<string, { code: string; name: string }>();
  for (const event of events) {
    for (const team of event.match?.teams ?? []) {
      if (team.code && !seen.has(team.code)) seen.set(team.code, { code: team.code, name: team.name });
    }
  }
  return Array.from(seen.values()).sort((a, b) => a.name.localeCompare(b.name));
}

export type { LolEvent };
