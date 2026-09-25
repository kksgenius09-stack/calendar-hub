import { NextResponse } from "next/server";
import { mapConnectionError, type ConnectionStage } from "@/app/lib/connection-errors";
import { discoverICloudCalendars, sealICloudCredentials } from "@/app/lib/icloud-caldav";
import { saveConnection } from "@/app/lib/connection-store";

export async function POST(request: Request) {
  let stage: ConnectionStage = "validate";
  try {
    const input = await request.json() as { email?: string; password?: string };
    if (!input.email?.trim() || !input.password) throw new Error("INVALID_CREDENTIALS");

    const credentials = { email: input.email.trim(), password: input.password };
    stage = "authenticate";
    const calendars = await discoverICloudCalendars(credentials, undefined, () => {
      stage = "discover";
    });
    if (!calendars.length) throw new Error("NO_CALENDARS");

    stage = "save";
    await saveConnection("icloud", await sealICloudCredentials(credentials), credentials.email);
    return NextResponse.json({ connected: true, calendarCount: calendars.length });
  } catch (error) {
    const failure = mapConnectionError("icloud", stage, error);
    return NextResponse.json({ connected: false, error: failure }, { status: failure.code === "AUTH_REQUIRED" ? 401 : 400 });
  }
}
