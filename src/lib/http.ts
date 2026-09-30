import { NextResponse } from "next/server";
import { config } from "./config";

/** Public base URL for links in notifications (explicit config first, then request headers). */
export function baseUrlFrom(req: Request): string | undefined {
  if (config.baseUrl) return config.baseUrl;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (!host) return undefined;
  const proto = req.headers.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto}://${host}`;
}

export function jsonError(message: string, status = 400, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ error: message, ...extra }, { status });
}

export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
