import { NextResponse } from "next/server";
import { safeEqual, SESSION_COOKIE, sessionToken } from "@/lib/auth";
import { jsonError } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const password = process.env.APP_PASSWORD?.trim();
  if (!password) return NextResponse.json({ ok: true });
  const body = (await req.json().catch(() => ({}))) as { password?: string };
  if (!body.password || !safeEqual(await sessionToken(body.password), await sessionToken(password))) {
    await new Promise((r) => setTimeout(r, 600));
    return jsonError("Incorrect password", 401);
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, await sessionToken(password), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 60,
  });
  return res;
}
