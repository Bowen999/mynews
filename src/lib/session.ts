import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { createAuth, HttpError, type AuthBackend, type AuthUser, type CookieJar } from "./auth";
import { isEmailAllowed } from "./auth/policy";
import { config, hasSupabaseAuth } from "./config";

/** Cookie jar over next/headers; writes are ignored where Next forbids them (server components). */
async function requestJar(): Promise<CookieJar> {
  const store = await cookies();
  return {
    getAll: () => store.getAll().map((c) => ({ name: c.name, value: c.value })),
    set: (name, value, options) => {
      try {
        store.set(name, value, options);
      } catch {
        // Server components cannot set cookies; the proxy refreshes sessions instead.
      }
    },
  };
}

/** Refuse sign-in on a deployment where accounts would not persist (no Supabase Auth on Vercel). */
export function assertAuthConfigured() {
  if (config.onVercel && !hasSupabaseAuth()) {
    throw new HttpError(503, "Sign-in is not configured yet: the site owner needs to set SUPABASE_ANON_KEY and redeploy.");
  }
}

export async function authForRequest(): Promise<AuthBackend> {
  return createAuth(await requestJar());
}

/** The signed-in, allow-listed user for this request (memoized per render). */
export const currentUser = cache(async (): Promise<AuthUser | null> => {
  const user = await (await authForRequest()).getUser();
  return user && isEmailAllowed(user.email) ? user : null;
});

export async function requireUser(): Promise<AuthUser> {
  const user = await currentUser();
  if (!user) throw new HttpError(401, "Please sign in.");
  return user;
}

/** For pages: redirect to sign-in (returning here afterwards) when there is no session. */
export async function requirePageUser(next: string): Promise<AuthUser> {
  const user = await currentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(next)}`);
  return user;
}

/** For admin pages: signed-out visitors go to sign-in, and everyone who is not an admin sees a 404. */
export async function requireAdminPage(next: string): Promise<AuthUser> {
  const user = await requirePageUser(next);
  if (!user.isAdmin) notFound();
  return user;
}
