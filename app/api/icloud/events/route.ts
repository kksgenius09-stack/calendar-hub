import { NextRequest, NextResponse } from "next/server";
import { discoverICloudCalendars, fetchICloudEvents, iCloudCookie, openICloudCredentials } from "@/app/lib/icloud-caldav";

export async function GET(request: NextRequest) {
  const sealed = request.cookies.get(iCloudCookie.name)?.value;
  const configured = Boolean(process.env.ICLOUD_BOOTSTRAP_EMAIL && process.env.ICLOUD_BOOTSTRAP_PASSWORD && process.env.ICLOUD_CREDENTIAL_SECRET);
  if (!sealed) return NextResponse.json({ connected: false, configured, calendars: [], events: [] });
  try {
    const credentials = await openICloudCredentials(sealed);
    const calendars = await discoverICloudCalendars(credentials);
    const now = new Date();
    const rangeStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    const rangeEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 2, 1));
    const groups = await Promise.all(calendars.map((calendar) => fetchICloudEvents(credentials, calendar, rangeStart, rangeEnd).catch(() => [])));
    return NextResponse.json({
      connected: true,
      configured: true,
      calendars: calendars.map(({ id, name, color }) => ({ id, name, color })),
      events: groups.flat(),
    });
  } catch {
    const response = NextResponse.json({ connected: false, configured, calendars: [], events: [], error: "reconnect_required" }, { status: 401 });
    response.cookies.delete(iCloudCookie.name);
    return response;
  }
}
