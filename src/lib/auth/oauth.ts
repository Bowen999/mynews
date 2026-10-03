import { config, hasSupabaseAuth } from "../config";
import { isOAuthProvider, OAUTH_PROVIDER_IDS, type OAuthProvider } from "./providers";

/**
 * OAUTH_PROVIDERS as a list in display order: "github,google" → ["github", "google"], "none" → [].
 * Unknown names are ignored. Undefined when the variable is unset (detect from Supabase instead).
 */
export function parseProviderList(raw: string | undefined): OAuthProvider[] | undefined {
  if (raw === undefined) return undefined;
  const wanted = raw
    .split(/[,\s]+/)
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean);
  return OAUTH_PROVIDER_IDS.filter((p) => wanted.includes(p));
}

let cached: { at: number; ok: boolean; providers: OAuthProvider[] } | null = null;

export function resetOAuthProviderCache() {
  cached = null;
}

/**
 * Social sign-in providers to offer: OAUTH_PROVIDERS when set, otherwise the ones switched on in
 * Supabase Auth, read from its public settings endpoint (cached for 10 minutes, 1 minute after an
 * error). Empty without Supabase Auth: local development accounts are email-only.
 */
export async function enabledOAuthProviders(fetchImpl: typeof fetch = fetch): Promise<OAuthProvider[]> {
  if (!hasSupabaseAuth()) return [];
  const configured = parseProviderList(config.auth.oauthProviders);
  if (configured) return configured;
  if (cached && Date.now() - cached.at < (cached.ok ? 10 * 60e3 : 60e3)) return cached.providers;
  try {
    const res = await fetchImpl(`${config.store.supabaseUrl}/auth/v1/settings`, {
      headers: { apikey: config.auth.supabaseAnonKey! },
      cache: "no-store",
      signal: AbortSignal.timeout(2500),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const settings = (await res.json()) as { external?: Record<string, unknown> };
    const providers = OAUTH_PROVIDER_IDS.filter((p) => settings.external?.[p] === true);
    cached = { at: Date.now(), ok: true, providers };
  } catch {
    // Without the settings we can't tell which buttons would work, so show none for now.
    cached = { at: Date.now(), ok: false, providers: [] };
  }
  return cached.providers;
}

export async function isEnabledOAuthProvider(provider: string): Promise<boolean> {
  return isOAuthProvider(provider) && (await enabledOAuthProviders()).includes(provider);
}

/** Map an error returned by the provider or Supabase on the callback to a short message. */
export function describeProviderError(code: string | null, description: string | null): string {
  const text = `${code ?? ""} ${description ?? ""}`.toLowerCase();
  if (text.includes("signups not allowed") || text.includes("signup is disabled")) return "New sign-ups are currently closed.";
  if (text.includes("email") && (text.includes("external provider") || text.includes("missing"))) {
    return "Your account didn’t share a verified email address. Add one with the provider, or sign in with email.";
  }
  if (text.includes("provider is not enabled") || text.includes("unsupported provider")) return "This sign-in option is not available right now.";
  if (text.includes("access_denied") || text.includes("denied") || text.includes("cancel")) return "Sign-in was cancelled.";
  return description?.trim().slice(0, 200) || "Sign-in didn’t complete. Try again.";
}
