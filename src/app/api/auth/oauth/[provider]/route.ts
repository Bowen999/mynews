import { NextResponse } from "next/server";
import { isEnabledOAuthProvider } from "@/lib/auth/oauth";
import { safeNext } from "@/lib/auth/policy";
import { OAUTH_PROVIDERS, type OAuthProvider } from "@/lib/auth/providers";
import { requestOrigin } from "@/lib/http";
import { authForRequest } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * Start signing in with GitHub or Google. The buttons on the sign-in page post here; the browser is
 * sent on to the provider through Supabase Auth and comes back to /auth/callback.
 */
export async function POST(req: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const url = new URL(req.url);
  // Come back to the origin the browser is on: the PKCE verifier cookie is set for it.
  const origin = requestOrigin(req) ?? url.origin;
  const next = safeNext(url.searchParams.get("next"));
  const back = (error: string) => {
    const to = new URL("/login", origin);
    to.searchParams.set("error", error);
    if (next !== "/") to.searchParams.set("next", next);
    return NextResponse.redirect(to, 303);
  };

  if (!(await isEnabledOAuthProvider(provider))) return back("This sign-in option is not available.");
  const id = provider as OAuthProvider;
  const callback = new URL("/auth/callback", origin);
  callback.searchParams.set("next", next);
  callback.searchParams.set("via", id);
  try {
    const { url: target, error } = await (await authForRequest()).oauthUrl(id, callback.toString());
    if (!target) return back(error ?? `Could not reach ${OAUTH_PROVIDERS[id].label}. Try again.`);
    return NextResponse.redirect(target, 303);
  } catch (e) {
    console.error("[oauth]", e);
    return back(`Could not reach ${OAUTH_PROVIDERS[id].label}. Try again.`);
  }
}
