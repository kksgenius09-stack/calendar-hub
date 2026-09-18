import { NextResponse } from "next/server";
import { discoverICloudCalendars, sealICloudCredentials } from "@/app/lib/icloud-caldav";
import { saveConnection } from "@/app/lib/connection-store";

export async function POST(request: Request) {
  try {
    const input = await request.json() as { email?: string; password?: string };
    if (!input.email || !input.password) return NextResponse.json({ error: "Apple 계정과 앱 전용 암호를 입력해 주세요." }, { status: 400 });
    const credentials = { email: input.email.trim(), password: input.password };
    const calendars = await discoverICloudCalendars(credentials);
    if (!calendars.length) throw new Error("No calendars");
    await saveConnection("icloud", await sealICloudCredentials(credentials), credentials.email);
    return NextResponse.json({ connected: true, calendarCount: calendars.length });
  } catch (error) {
    if (error instanceof Error && error.message === "AUTH_REQUIRED") return NextResponse.json({ error: "먼저 온달력에 로그인해 주세요." }, { status: 401 });
    return NextResponse.json({ error: "iCloud 연결에 실패했어요. Apple 계정과 앱 전용 암호를 확인해 주세요." }, { status: 400 });
  }
}
