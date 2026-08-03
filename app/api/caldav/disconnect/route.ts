import { NextResponse } from "next/server";
import { companyCalDavCookie } from "@/app/lib/company-caldav";

export async function POST(request: Request) {
  const origin = process.env.PUBLIC_APP_URL || new URL(request.url).origin;
  const response = NextResponse.redirect(`${origin}/?caldav=disconnected`, 303);
  response.cookies.delete(companyCalDavCookie.name);
  return response;
}
