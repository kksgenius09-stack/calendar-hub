import { NextResponse } from "next/server";
import { removeConnection } from "@/app/lib/connection-store";
export async function POST() { try { await removeConnection("caldav"); return NextResponse.json({ disconnected: true }); } catch { return NextResponse.json({ error: "auth_required" }, { status: 401 }); } }
