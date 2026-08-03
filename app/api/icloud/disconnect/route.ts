import { NextResponse } from "next/server";
import { iCloudCookie } from "@/app/lib/icloud-caldav";

export async function POST(request: Request) {
  const origin = process.env.PUBLIC_APP_URL || new URL(request.url).origin;
  const response = NextResponse.redirect(`${origin}/?icloud=disconnected`, 303);
  response.cookies.delete(iCloudCookie.name);
  return response;
}
