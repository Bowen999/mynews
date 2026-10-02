import { NextResponse } from "next/server";
import { safeNext } from "@/lib/auth/policy";
import { authForRequest } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * Landing point for Supabase email links (confirm sign-up, reset password). Supports the PKCE
 * `code` flow and the `token_hash` flow, then continues to `next`.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const next = safeNext(url.searchParams.get("next"));
  const auth = await authForRequest();
  const { error } = await auth.completeEmailLink({
    code: url.searchParams.get("code") ?? undefined,
    tokenHash: url.searchParams.get("token_hash") ?? undefined,
    type: url.searchParams.get("type") ?? undefined,
  });
  const target = new URL(error ? "/login" : next, url.origin);
  if (error) target.searchParams.set("error", error);
  return NextResponse.redirect(target);
}
