import { makeRedirectUri } from "expo-auth-session";
import Constants from "expo-constants";

export type MobileEnv = { apiUrl: string; supabaseUrl: string; supabasePublishableKey: string; authRedirectUrlOverride: string; authBridgeUrl: string };
const read = (value: string | undefined, fallback: string) => value?.trim() || fallback;
export const env: MobileEnv = {
  apiUrl: read(process.env.EXPO_PUBLIC_API_URL, ""),
  supabaseUrl: read(process.env.EXPO_PUBLIC_SUPABASE_URL, ""),
  supabasePublishableKey: read(process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY, ""),
  authRedirectUrlOverride: read(process.env.EXPO_PUBLIC_AUTH_REDIRECT_URL, ""),
  authBridgeUrl: read(process.env.EXPO_PUBLIC_AUTH_BRIDGE_URL, "https://ondalcalendar.kr/mobile-auth/callback"),
};

/**
 * Expo Go uses an exp:// callback while standalone builds use the app scheme.
 * Keeping this in one function makes the URL passed to Supabase and the URL
 * watched by WebBrowser identical in every environment.
 */
export function getAuthRedirectUrl(): string {
  return env.authRedirectUrlOverride || makeRedirectUri({ scheme: "ondalcalendar", path: "auth/callback" });
}

export function isExpoGo(): boolean {
  return Constants.executionEnvironment === "storeClient" || Constants.appOwnership === "expo";
}

export function getSupabaseAuthRedirectUrl(): string {
  const target = getAuthRedirectUrl();
  if (!isExpoGo()) return target;
  const bridge = new URL(env.authBridgeUrl);
  bridge.searchParams.set("redirect_to", target);
  return bridge.toString();
}
