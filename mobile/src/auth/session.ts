import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient, type Session, type User } from "@supabase/supabase-js";
import { env } from "../config/env";

const storage = AsyncStorage;
export const supabase = createClient(env.supabaseUrl, env.supabasePublishableKey, {
  auth: { storage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false },
});

export type MobileSession = { session: Session | null; user: User | null };

export async function getSession(): Promise<MobileSession> {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw new Error("인증 상태를 확인하지 못했어요.");
  return { session: data.session, user: data.session?.user ?? null };
}

/** Returns an OAuth URL for the native browser/auth-session flow. */
export async function signInWithGoogle(): Promise<{ url: string }> {
  const redirectTo = env.authRedirectUrl || "onecalendar://auth/callback";
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo,
      skipBrowserRedirect: true,
      scopes: "https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/calendar.events",
      queryParams: { access_type: "offline", prompt: "consent", include_granted_scopes: "true" },
    },
  });
  if (error || !data.url) throw new Error("Google 로그인을 시작하지 못했어요.");
  return { url: data.url };
}

export async function signOut(): Promise<void> {
  const { error } = await supabase.auth.signOut();
  if (error) throw new Error("로그아웃하지 못했어요.");
}

export function onSessionChange(callback: (session: Session | null) => void) {
  return supabase.auth.onAuthStateChange((_event, session) => callback(session)).data.subscription;
}
