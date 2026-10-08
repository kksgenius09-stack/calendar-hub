export type SportsEventRow = {
  id: string;
  sport: string;
  team_ids: string[];
  home_team: string;
  away_team: string;
  start_time: string;
  status: "scheduled" | "live" | "final";
  venue: string | null;
};
