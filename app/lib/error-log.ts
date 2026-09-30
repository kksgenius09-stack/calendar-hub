import { getSupabaseServerClient } from "@/app/lib/supabase/server";

type ErrorLogInput = {
  provider: "google" | "icloud" | "caldav" | "app";
  action: "connect" | "disconnect" | "load" | "create" | "update" | "delete" | "sync" | "visit";
  stage: string;
  errorCode: string;
  statusCode?: number;
};

function maskedEmail(email: string | undefined | null) {
  if (!email) return null;
  const [local, domain] = email.toLowerCase().split("@");
  if (!domain) return null;
  return `${local.slice(0, Math.min(5, local.length))}***@${domain}`;
}

/** 개인정보·일정 내용 없이 운영 원인만 기록합니다. 로깅 실패는 사용자 요청에 영향을 주지 않습니다. */
export async function recordErrorLog(input: ErrorLogInput) {
  try {
    const supabase = await getSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from("error_logs").insert({
      user_id: user.id,
      user_label: maskedEmail(user.email),
      provider: input.provider,
      action: input.action,
      stage: input.stage.slice(0, 80),
      error_code: input.errorCode.slice(0, 120),
      status_code: input.statusCode ?? null,
      app_version: process.env.NEXT_PUBLIC_APP_VERSION ?? null,
    });
  } catch {
    // 오류 기록 자체가 사용자 동작을 방해하지 않도록 무시합니다.
  }
}

export async function recordUsageEvent(input: {
  eventName: "visit" | "calendar_connect" | "calendar_disconnect" | "event_create" | "event_update" | "event_delete" | "search" | "sync";
  provider?: "google" | "icloud" | "caldav" | "app";
  success?: boolean;
}) {
  try {
    const supabase = await getSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from("usage_events").insert({ user_id: user.id, user_label: maskedEmail(user.email), event_name: input.eventName, provider: input.provider ?? null, success: input.success ?? true });
  } catch {
    // 통계 기록 실패는 사용자 요청에 영향을 주지 않습니다.
  }
}
