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
    const message = error instanceof Error && error.message.includes("주소") ? error.message : "연결에 실패했습니다. 서버 주소와 로그인 정보를 확인해 주세요.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
