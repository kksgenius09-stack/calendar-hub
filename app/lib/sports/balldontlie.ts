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
  // The API also returns one-off exhibition/international teams (e.g. NBA preseason
  // opponents) with a blank conference. Real NBA franchises always have East/West.
  return json.data.filter((team) => team.conference?.trim() === "East" || team.conference?.trim() === "West");
}

export const NBA_TEAM_NAME_KO: Record<number, string> = {
  1: "애틀랜타 호크스",
  2: "보스턴 셀틱스",
  3: "브루클린 네츠",
  4: "샬럿 호네츠",
  5: "시카고 불스",
  6: "클리블랜드 캐벌리어스",
  7: "댈러스 매버릭스",
  8: "덴버 너기츠",
  9: "디트로이트 피스톤스",
  10: "골든스테이트 워리어스",
  11: "휴스턴 로키츠",
  12: "인디애나 페이서스",
  13: "LA 클리퍼스",
  14: "LA 레이커스",
  15: "멤피스 그리즐리스",
  16: "마이애미 히트",
  17: "밀워키 벅스",
  18: "미네소타 팀버울브스",
  19: "뉴올리언스 펠리컨스",
  20: "뉴욕 닉스",
  21: "오클라호마시티 썬더",
  22: "올랜도 매직",
  23: "필라델피아 세븐티식서스",
  24: "피닉스 선즈",
  25: "포틀랜드 트레일블레이저스",
  26: "새크라멘토 킹스",
  27: "샌안토니오 스퍼스",
  28: "토론토 랩터스",
  29: "유타 재즈",
  30: "워싱턴 위저즈",
};

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
