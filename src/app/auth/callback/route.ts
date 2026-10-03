import { NextResponse } from "next/server";
import { describeProviderError } from "@/lib/auth/oauth";
import { safeNext, signInProblem } from "@/lib/auth/policy";
import { FLASH_COOKIE, isOAuthProvider, OAUTH_PROVIDER_IDS } from "@/lib/auth/providers";
import { config } from "@/lib/config";
import { requestOrigin } from "@/lib/http";
import { authForRequest } from "@/lib/session";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

/**
 * Landing point for Supabase email links (confirm sign-up, reset password) and for signing in with
 * GitHub or Google. Supports the PKCE `code` flow and the `token_hash` flow, applies the same
 * allow-list and sign-up rules as email sign-in, then continues to `next`.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const origin = requestOrigin(req) ?? url.origin;
  const params = url.searchParams;
  let next = safeNext(params.get("next"));
  const fail = (error: string) => {
    const target = new URL("/login", origin);
    target.searchParams.set("error", error);
    if (next !== "/") target.searchParams.set("next", next);
    return NextResponse.redirect(target);
  };

  // The provider (or Supabase) refused: cancelled, expired link, sign-ups closed…
  if (params.get("error") && !params.get("code")) {
    return fail(
      params.get("error_code") === "otp_expired"
        ? "This link has expired or was already used. Request a new one."
        : describeProviderError(params.get("error"), params.get("error_description")),
    );
  }

  const auth = await authForRequest();
  const result = await auth.completeEmailLink({
    code: params.get("code") ?? undefined,
    tokenHash: params.get("token_hash") ?? undefined,
    type: params.get("type") ?? undefined,
  });
  if (result.error) return fail(result.error);
  const user = result.user ?? (await auth.getUser());
  if (!user) return fail("Sign-in didn’t complete. Try again.");

  // An account without a profile is new. While sign-ups are closed, only existing accounts get in.
  let isNew = false;
  try {
    isNew = !(await getStore().getProfileByOwner(user.id));
  } catch (e) {
    console.error("[auth/callback]", e);
    if (config.auth.signupsDisabled && !user.isAdmin) {
      await auth.signOut();
      return fail("Sign-in is temporarily unavailable. Try again in a minute.");
    }
  }
  const problem = signInProblem(user, isNew);
  if (problem) {
    await auth.signOut();
    return fail(problem);
  }

  // Say what happened on the next page (see Toaster). `via` is absent when Supabase fell back to the Site URL.
  const via = params.get("via");
  const provider = isOAuthProvider(via)
    ? via
    : user.providers?.includes("email")
      ? undefined
      : OAUTH_PROVIDER_IDS.find((p) => user.providers?.includes(p));
  const flash = provider ? `${isNew ? "welcome" : "signed-in"}:${provider}` : isNew ? "email-confirmed" : null;
  if (isNew) next = "/profile";

  const res = NextResponse.redirect(new URL(next, origin));
  if (flash) res.cookies.set(FLASH_COOKIE, flash, { path: "/", maxAge: 60, sameSite: "lax" });
  return res;
}
