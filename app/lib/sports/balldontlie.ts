const BASE_URL = "https://api.balldontlie.io/v1";

function authHeaders(): HeadersInit {
  const key = process.env.BALLDONTLIE_API_KEY;
  if (!key) throw new Error("BALLDONTLIE_API_KEY is not configured");
  return { Authorization: key };
}

export type NbaTeam = {
  id: number;
  full_name: string;
  abbreviation: string;
  city: string;
  name: string;
  conference: string;
  division: string;
};

export async function fetchNbaTeams(): Promise<NbaTeam[]> {
  const res = await fetch(`${BASE_URL}/teams`, { headers: authHeaders() });
  if (!res.ok) throw new Error(`balldontlie teams fetch failed: ${res.status}`);
  const json = (await res.json()) as { data: NbaTeam[] };
  return json.data;
}

export type NbaGame = {
  id: number;
  date: string;
  datetime: string;
  status: string;
  status_state?: string;
  home_team: NbaTeam;
  visitor_team: NbaTeam;
};

export async function fetchNbaGamesForTeam(teamId: number, startDate: string, endDate: string): Promise<NbaGame[]> {
  const params = new URLSearchParams({ start_date: startDate, end_date: endDate, per_page: "100" });
  params.append("team_ids[]", String(teamId));
  const res = await fetch(`${BASE_URL}/games?${params.toString()}`, { headers: authHeaders() });
  if (!res.ok) throw new Error(`balldontlie games fetch failed: ${res.status}`);
  const json = (await res.json()) as { data: NbaGame[] };
  return json.data;
}
