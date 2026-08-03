import { NextResponse } from "next/server";
import { companyCalDavCookie, discoverCompanyCalendars, sealCompanyCredentials, validateCalDavServer } from "@/app/lib/company-caldav";

export async function POST(request: Request) {
  try {
    const input = await request.json() as { serverUrl?: string; email?: string; password?: string };
    if (!input.serverUrl || !input.email || !input.password) return NextResponse.json({ error: "모든 항목을 입력해 주세요." }, { status: 400 });
    const credentials = { serverUrl: validateCalDavServer(input.serverUrl), email: input.email.trim(), password: input.password };
    const calendars = await discoverCompanyCalendars(credentials);
    if (!calendars.length) return NextResponse.json({ error: "불러올 수 있는 캘린더가 없습니다." }, { status: 400 });
    const response = NextResponse.json({ connected: true, calendarCount: calendars.length });
    response.cookies.set(companyCalDavCookie.name, await sealCompanyCredentials(credentials), companyCalDavCookie.options);
    return response;
  } catch (error) {
    const code = error instanceof Error ? error.message : "UNKNOWN";
    const messages: Record<string, string> = {
      CALDAV_HTTP_401: "서버가 로그인을 거부했습니다. 아이디와 비밀번호를 확인해 주세요.",
      CALDAV_HTTP_403: "로그인은 확인됐지만 CalDAV 사용 권한이 없습니다. 회사 관리자 설정을 확인해 주세요.",
      CALDAV_HTTP_404: "이 서버에서 CalDAV 경로를 찾지 못했습니다.",
      CALDAV_PRINCIPAL_NOT_FOUND: "서버 로그인은 됐지만 사용자 캘린더 경로를 확인하지 못했습니다.",
      CALDAV_HOME_NOT_FOUND: "사용자 인증은 됐지만 캘린더 보관함 경로를 확인하지 못했습니다.",
    };
    const message = code.includes("주소") ? code : messages[code] || `서버에는 접속했지만 CalDAV 응답을 해석하지 못했습니다. (진단: ${code})`;
    return NextResponse.json({ error: message, code }, { status: 400 });
  }
}
