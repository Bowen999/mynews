import { NextResponse } from "next/server";
import { HttpError } from "@/lib/auth";
import { passwordProblem } from "@/lib/auth/policy";
import { handleApi, readJson } from "@/lib/http";
import { authForRequest, requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return handleApi(async () => {
    await requireUser();
    const { password } = await readJson<{ password?: string }>(req);
    const weak = passwordProblem(password ?? "");
    if (weak) throw new HttpError(400, weak);
    const result = await (await authForRequest()).updatePassword(password!);
    if (result.error) throw new HttpError(400, result.error);
    return NextResponse.json({ ok: true });
  });
}
