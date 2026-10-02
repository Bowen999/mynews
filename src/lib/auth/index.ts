import { hasSupabaseAuth } from "../config";
import { localDataDir } from "../store";
import { LocalAuth } from "./local";
import { SupabaseAuth } from "./supabase";
import type { AuthBackend, CookieJar } from "./types";

export type { AuthBackend, AuthUser, CookieJar } from "./types";
export { HttpError } from "./types";

export function createAuth(jar: CookieJar): AuthBackend {
  return hasSupabaseAuth() ? new SupabaseAuth(jar) : new LocalAuth(jar, localDataDir());
}
