import { NextRequest, NextResponse } from "next/server";
import { companyCalDavCookie, openCompanyCredentials } from "@/app/lib/company-caldav";
import { discoverICloudCalendars, fetchICloudEvents } from "@/app/lib/icloud-caldav";

export async function GET(request: NextRequest) {
  const sealed = request.cookies.get(companyCalDavCookie.name)?.value;
  if (!sealed) return NextResponse.json({ connected: false, calendars: [], events: [] });
  try {
    const credentials = await openCompanyCredentials(sealed);
    const calendars = await discoverICloudCalendars(credentials, credentials.serverUrl);
    const now = new Date();
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 2, 1));
    const groups = await Promise.all(calendars.map((calendar) => fetchICloudEvents(credentials, calendar, start, end).catch(() => [])));
    return NextResponse.json({ connected: true, calendars: calendars.map(({ id, name, color }) => ({ id, name, color })), events: groups.flat() });
  } catch {
    const response = NextResponse.json({ connected: false, calendars: [], events: [], error: "reconnect_required" }, { status: 401 });
    response.cookies.delete(companyCalDavCookie.name);
    return response;
  }
}
