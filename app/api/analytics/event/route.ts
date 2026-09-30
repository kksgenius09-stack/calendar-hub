import { NextResponse } from "next/server";
import { recordUsageEvent } from "@/app/lib/error-log";

const events = new Set(["visit", "calendar_connect", "calendar_disconnect", "event_create", "event_update", "event_delete", "search", "sync"]);
const providers = new Set(["google", "icloud", "caldav", "app"]);

export async function POST(request: Request) {
  try {
    const body = await request.json() as { eventName?: string; provider?: string; success?: boolean };
    if (!body.eventName || !events.has(body.eventName) || (body.provider && !providers.has(body.provider))) return NextResponse.json({ ok: false }, { status: 400 });
    await recordUsageEvent({ eventName: body.eventName as never, provider: body.provider as never, success: body.success !== false });
    return NextResponse.json({ ok: true });
  } catch { return NextResponse.json({ ok: false }, { status: 400 }); }
}
