import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { LOCAL_SESSION_COOKIE, readSessionToken } from "./lib/auth/local";
import { config as appConfig, hasSupabaseAuth } from "./lib/config";

const PUBLIC_PAGES = ["/", "/login", "/signup", "/forgot-password"];

function isPublic(pathname: string): boolean {
  return PUBLIC_PAGES.includes(pathname) || pathname.startsWith("/auth/");
}

/**
 * Keeps Supabase sessions fresh and sends signed-out visitors to the sign-in page. This is a
 * convenience layer only: every page and API route verifies the user again on the server.
 * API routes are excluded from the matcher and answer 401 themselves.
 */
export async function proxy(request: NextRequest) {
  // Supabase sends the browser to the Site URL (the front page) when a sign-in redirect URL isn't on
  // its allow list; finish the sign-in there as well.
  const params = request.nextUrl.searchParams;
  if (request.nextUrl.pathname === "/" && (params.has("code") || params.has("error_description"))) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth/callback";
    return NextResponse.redirect(url);
  }

  let response = NextResponse.next({ request });
  let signedIn = false;

  if (hasSupabaseAuth()) {
    const supabase = createServerClient(appConfig.store.supabaseUrl!, appConfig.auth.supabaseAnonKey!, {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookies) => {
          for (const { name, value } of cookies) request.cookies.set(name, value);
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookies) response.cookies.set(name, value, options);
        },
      },
    });
    const { data } = await supabase.auth.getUser();
    signedIn = Boolean(data.user);
  } else {
    signedIn = Boolean(readSessionToken(request.cookies.get(LOCAL_SESSION_COOKIE)?.value, appConfig.auth.localSecret));
  }

  const { pathname, search } = request.nextUrl;
  if (signedIn || isPublic(pathname)) return response;
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = `?next=${encodeURIComponent(pathname + search)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!api/|_next/static|_next/image|favicon.ico|icon.svg|apple-icon.png|manifest.webmanifest|.*\\.(?:png|jpg|jpeg|svg|webp|ico|woff2?)$).*)"],
};
