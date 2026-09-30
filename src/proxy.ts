import { NextResponse, type NextRequest } from "next/server";
import { isValidSession, SESSION_COOKIE } from "./lib/auth";

/** When APP_PASSWORD is set, every page and API route requires the session cookie. */
export async function proxy(request: NextRequest) {
  const password = process.env.APP_PASSWORD?.trim();
  if (!password) return NextResponse.next();
  if (await isValidSession(request.cookies.get(SESSION_COOKIE)?.value, password)) return NextResponse.next();
  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = `?next=${encodeURIComponent(request.nextUrl.pathname + request.nextUrl.search)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!login|api/login|_next/static|_next/image|favicon.ico|icon.svg|apple-icon.png|manifest.webmanifest).*)"],
};
