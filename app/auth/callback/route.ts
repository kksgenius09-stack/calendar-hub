import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/app/lib/supabase/server";
import { sealTokens } from "@/app/lib/google-oauth";

function safeNextPath(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/";
  try {
    const parsed = new URL(value, "https://app.local");
    if (parsed.origin !== "https://app.local") return "/";
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return "/";
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = safeNextPath(url.searchParams.get("next"));
  if (code) {
    const supabase = await getSupabaseServerClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error && data.session) {
      if (data.session.provider_token) {
        const sealed = await sealTokens({
          access_token: data.session.provider_token,
          refresh_token: data.session.provider_refresh_token || undefined,
          expires_at: Date.now() + 55 * 60 * 1000,
        });
        const { error: connectionError } = await supabase.from("calendar_connections").upsert({
          user_id: data.session.user.id,
          provider: "google",
          encrypted_credentials: sealed,
          account_label: data.session.user.email || "Google",
          updated_at: new Date().toISOString(),
        }, { onConflict: "user_id,provider" });
        if (connectionError) return NextResponse.redirect(new URL("/?google=failed", url.origin));
      } else if (next.includes("google=connected")) return NextResponse.redirect(new URL("/?google=failed", url.origin));
      return NextResponse.redirect(new URL(next, url.origin));
    }
  }
  return NextResponse.redirect(new URL("/?auth=failed", url.origin));
}
