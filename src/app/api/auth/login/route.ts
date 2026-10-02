import { NextResponse } from "next/server";
import { HttpError } from "@/lib/auth";
import { isEmailAllowed, normalizeEmail } from "@/lib/auth/policy";
import { handleApi, readJson } from "@/lib/http";
import { assertAuthConfigured, authForRequest } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return handleApi(async () => {
    assertAuthConfigured();
    const body = await readJson<{ email?: string; password?: string }>(req);
    const email = normalizeEmail(body.email ?? "");
    if (!email || !body.password) throw new HttpError(400, "Enter your email and password.");
    if (!isEmailAllowed(email)) throw new HttpError(403, "This email address is not on the list of allowed users.");
    const auth = await authForRequest();
    const result = await auth.signIn(email, body.password);
    if (result.error) {
      await new Promise((r) => setTimeout(r, 400));
      throw new HttpError(401, result.error);
    }
    return NextResponse.json({ ok: true });
  });
}
