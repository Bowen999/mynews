import { createClient, type User } from "@supabase/supabase-js";
import { config, hasSupabaseAuth } from "../config";
import { localDataDir } from "../store";
import { listLocalAccounts } from "./local";
import { isAdminEmail, normalizeEmail } from "./policy";
import type { Account } from "./types";

const PER_PAGE = 200;
const MAX_PAGES = 50;

/** A Supabase Auth user as an account; users without an email address (not supported by the app) are skipped. */
export function accountFromSupabaseUser(u: User): Account | null {
  if (!u.email) return null;
  const meta = u.app_metadata ?? {};
  const providers = Array.isArray(meta.providers) && meta.providers.length ? (meta.providers as string[]) : [typeof meta.provider === "string" ? meta.provider : "email"];
  return {
    id: u.id,
    email: normalizeEmail(u.email),
    isAdmin: isAdminEmail(u.email),
    providers,
    createdAt: u.created_at,
    lastSignInAt: u.last_sign_in_at ?? undefined,
    confirmed: Boolean(u.email_confirmed_at ?? u.confirmed_at),
  };
}

async function listSupabaseAccounts(): Promise<Account[]> {
  const { supabaseUrl: url, supabaseKey: key } = config.store;
  if (!url || !key) throw new Error("Listing accounts needs SUPABASE_SERVICE_ROLE_KEY (the service_role / secret key).");
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const accounts: Account[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage: PER_PAGE });
    if (error) throw new Error(`Supabase Auth: ${error.message.slice(0, 200)}`);
    for (const u of data.users) {
      const a = accountFromSupabaseUser(u);
      if (a) accounts.push(a);
    }
    if (data.users.length < PER_PAGE) break;
  }
  return accounts;
}

/** Every account, for the admin pages. Server-side only: it uses the service-role key. */
export async function listAccounts(): Promise<Account[]> {
  return hasSupabaseAuth() ? listSupabaseAccounts() : listLocalAccounts(localDataDir());
}
