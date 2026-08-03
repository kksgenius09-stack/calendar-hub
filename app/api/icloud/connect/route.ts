import { NextResponse } from "next/server";
import { discoverICloudCalendars, iCloudCookie, sealICloudCredentials } from "@/app/lib/icloud-caldav";

export async function POST(request: Request) {
  const origin = process.env.PUBLIC_APP_URL || new URL(request.url).origin;
  const email = process.env.ICLOUD_BOOTSTRAP_EMAIL;
  const password = process.env.ICLOUD_BOOTSTRAP_PASSWORD;
  if (!email || !password) return NextResponse.redirect(`${origin}/?icloud=setup-required`, 303);
  try {
    const credentials = { email, password };
    const calendars = await discoverICloudCalendars(credentials);
    if (!calendars.length) throw new Error("No iCloud calendars found");
    const response = NextResponse.redirect(`${origin}/?icloud=connected`, 303);
    response.cookies.set(iCloudCookie.name, await sealICloudCredentials(credentials), iCloudCookie.options);
    return response;
  } catch {
    return NextResponse.redirect(`${origin}/?icloud=failed`, 303);
  }
}
