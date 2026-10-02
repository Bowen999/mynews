import { NextResponse } from "next/server";
import { handleApi } from "@/lib/http";
import { authForRequest } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST() {
  return handleApi(async () => {
    await (await authForRequest()).signOut();
    return NextResponse.json({ ok: true });
  });
}
