import { NextResponse } from "next/server";
import { HttpError } from "./auth/types";
import { config } from "./config";

/** Public base URL for links in notifications (explicit config first, then request headers). */
export function baseUrlFrom(req: Request): string | undefined {
  return config.baseUrl ?? requestOrigin(req);
}

/** The origin the browser used for this request (behind proxies, from the forwarded headers). */
export function requestOrigin(req: Request): string | undefined {
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

/** Wrap a route handler: HttpError → JSON with its status; anything else → 500. */
export async function handleApi(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof HttpError) return jsonError(e.message, e.status, e.extra);
    console.error("[api]", e);
    return jsonError(errorMessage(e), 500);
  }
}

export async function readJson<T = Record<string, unknown>>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new HttpError(400, "Invalid JSON body");
  }
}
