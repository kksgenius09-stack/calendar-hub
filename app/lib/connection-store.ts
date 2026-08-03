import { getSupabaseServerClient } from "@/app/lib/supabase/server";

export type ConnectionProvider = "google" | "icloud" | "caldav";

async function authenticatedClient() {
  const client = await getSupabaseServerClient();
  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user) throw new Error("AUTH_REQUIRED");
  return { client, user };
}

export async function loadConnection(provider: ConnectionProvider) {
  const { client } = await authenticatedClient();
  const { data, error } = await client.from("calendar_connections").select("encrypted_credentials,account_label").eq("provider", provider).maybeSingle();
  if (error) throw error;
  return data ? { encrypted: data.encrypted_credentials as string, label: data.account_label as string | null } : null;
}

export async function saveConnection(provider: ConnectionProvider, encrypted: string, label?: string) {
  const { client, user } = await authenticatedClient();
  const { error } = await client.from("calendar_connections").upsert({ user_id: user.id, provider, encrypted_credentials: encrypted, account_label: label || null, updated_at: new Date().toISOString() }, { onConflict: "user_id,provider" });
  if (error) throw error;
}

export async function removeConnection(provider: ConnectionProvider) {
  const { client } = await authenticatedClient();
  const { error } = await client.from("calendar_connections").delete().eq("provider", provider);
  if (error) throw error;
}

export async function requireOnCalUser() {
  const { user } = await authenticatedClient();
  return user;
}
