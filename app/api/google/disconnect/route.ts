import { NextResponse } from "next/server";
import { googleCookie } from "@/app/lib/google-oauth";

export async function POST(request: Request) {
  const response = NextResponse.redirect(new URL("/", request.url), 303);
  response.cookies.delete(googleCookie.name);
  return response;
}
