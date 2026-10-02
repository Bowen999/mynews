import { NextResponse } from "next/server";
import { config } from "@/lib/config";
import { handleApi, baseUrlFrom, readJson } from "@/lib/http";
import { HttpError } from "@/lib/auth";
import { isAdminEmail, isEmailAllowed, isValidEmail, normalizeEmail, passwordProblem } from "@/lib/auth/policy";
import { assertAuthConfigured, authForRequest } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return handleApi(async () => {
    assertAuthConfigured();
    const body = await readJson<{ email?: string; password?: string }>(req);
    const email = normalizeEmail(body.email ?? "");
    const password = body.password ?? "";
    if (!isValidEmail(email)) throw new HttpError(400, "Enter a valid email address.");
    const weak = passwordProblem(password);
    if (weak) throw new HttpError(400, weak);
    if (config.auth.signupsDisabled && !isAdminEmail(email)) throw new HttpError(403, "New sign-ups are currently closed.");
    if (!isEmailAllowed(email)) throw new HttpError(403, "This email address is not on the list of allowed users.");
    const auth = await authForRequest();
    const result = await auth.signUp(email, password, `${baseUrlFrom(req) ?? ""}/auth/callback?next=/profile`);
    if (result.error) throw new HttpError(400, result.error);
    return NextResponse.json({ ok: true, needsConfirmation: Boolean(result.needsConfirmation) });
  });
}
