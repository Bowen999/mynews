import { NextResponse } from "next/server";
import { HttpError } from "@/lib/auth";
import { isValidEmail, normalizeEmail } from "@/lib/auth/policy";
import { baseUrlFrom, handleApi, readJson } from "@/lib/http";
import { assertAuthConfigured, authForRequest } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Sends a reset link. Always answers the same way so it cannot be used to probe accounts. */
export async function POST(req: Request) {
  return handleApi(async () => {
    assertAuthConfigured();
    const { email } = await readJson<{ email?: string }>(req);
    const e = normalizeEmail(email ?? "");
    if (!isValidEmail(e)) throw new HttpError(400, "Enter a valid email address.");
    const auth = await authForRequest();
    const result = await auth.requestPasswordReset(e, `${baseUrlFrom(req) ?? ""}/auth/callback?next=/account/password`);
    if (result.error && auth.kind === "local") throw new HttpError(400, result.error);
    return NextResponse.json({ ok: true });
  });
}
