import { NextResponse, type NextRequest } from "next/server";

import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";

export async function proxy(request: NextRequest) {
  const isAuthed = await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  const { pathname } = request.nextUrl;

  if (pathname === "/login") {
    if (isAuthed) return NextResponse.redirect(new URL("/", request.url));
    return NextResponse.next();
  }

  if (isAuthed) return NextResponse.next();

  // Unauthenticated API calls get a status, not an HTML redirect.
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.redirect(new URL("/login", request.url));
}

export const config = {
  matcher: [
    /*
     * Everything except the login endpoint and Next's own static assets.
     */
    "/((?!api/auth|_next/static|_next/image|favicon.ico|icon.svg).*)",
  ],
};
