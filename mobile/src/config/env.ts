export type MobileEnv = { apiUrl: string; supabaseUrl: string; supabasePublishableKey: string; authRedirectUrl: string };
const read = (value: string | undefined, fallback: string) => value?.trim() || fallback;
export const env: MobileEnv = {
  apiUrl: read(process.env.EXPO_PUBLIC_API_URL, ""),
  supabaseUrl: read(process.env.EXPO_PUBLIC_SUPABASE_URL, ""),
  supabasePublishableKey: read(process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY, ""),
  authRedirectUrl: read(process.env.EXPO_PUBLIC_AUTH_REDIRECT_URL, "ondalcalendar://auth/callback"),
};
