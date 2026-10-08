import { getSupabaseServerClient } from "@/app/lib/supabase/server";

async function authenticatedClient() {
  const client = await getSupabaseServerClient();
  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user) throw new Error("AUTH_REQUIRED");
  return { client, user };
}

export type SportsFollow = { sport: string; teamId: string; teamName: string };

export async function listFollows(sport?: string): Promise<SportsFollow[]> {
  const { client, user } = await authenticatedClient();
  let query = client.from("sports_follows").select("sport,team_id,team_name").eq("user_id", user.id);
  if (sport) query = query.eq("sport", sport);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map((row) => ({ sport: row.sport, teamId: row.team_id, teamName: row.team_name }));
}

export async function followTeam(sport: string, teamId: string, teamName: string) {
  const { client, user } = await authenticatedClient();
  const { error } = await client.from("sports_follows").upsert(
    { user_id: user.id, sport, team_id: teamId, team_name: teamName },
    { onConflict: "user_id,sport,team_id" },
  );
  if (error) throw error;
}

export async function unfollowTeam(sport: string, teamId: string) {
  const { client, user } = await authenticatedClient();
  const { error } = await client.from("sports_follows").delete().eq("sport", sport).eq("team_id", teamId);
  if (error) throw error;
}
