import { NextResponse } from "next/server";
import { mapConnectionError, type ConnectionStage } from "@/app/lib/connection-errors";
import { discoverCompanyCalendars, sealCompanyCredentials, validateCalDavServer } from "@/app/lib/company-caldav";
import { saveConnection } from "@/app/lib/connection-store";

export async function POST(request: Request) {
  let stage: ConnectionStage = "validate";
  try {
    const input = await request.json() as { serverUrl?: string; email?: string; password?: string };
    if (!input.serverUrl?.trim()) throw new Error("INVALID_SERVER_URL");
    if (!input.email?.trim() || !input.password) throw new Error("INVALID_CREDENTIALS");
    const credentials = { serverUrl: validateCalDavServer(input.serverUrl), email: input.email.trim(), password: input.password };
    stage = "authenticate";
    const calendars = await discoverCompanyCalendars(credentials, () => {
      stage = "discover";
    });
    if (!calendars.length) throw new Error("NO_CALENDARS");

    stage = "save";
    await saveConnection("caldav", await sealCompanyCredentials(credentials), credentials.email);
    return NextResponse.json({ connected: true, calendarCount: calendars.length });
  } catch (error) {
    const failure = mapConnectionError("caldav", stage, error);
    return NextResponse.json({ connected: false, error: failure }, { status: failure.code === "AUTH_REQUIRED" ? 401 : 400 });
  }
}
