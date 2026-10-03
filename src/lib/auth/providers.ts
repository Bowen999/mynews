/**
 * Social sign-in providers the app can offer through Supabase Auth, and the one-off "flash"
 * messages shown after server redirects. Client-safe: nothing here reads the environment.
 */
export const OAUTH_PROVIDERS = {
  github: { label: "GitHub" },
  google: { label: "Google" },
} as const;

export type OAuthProvider = keyof typeof OAUTH_PROVIDERS;

export const OAUTH_PROVIDER_IDS = Object.keys(OAUTH_PROVIDERS) as OAuthProvider[];

export function isOAuthProvider(value: unknown): value is OAuthProvider {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(OAUTH_PROVIDERS, value);
}

/** "github" → "GitHub", "email" → "Email and password". */
export function providerLabel(id: string): string {
  if (isOAuthProvider(id)) return OAUTH_PROVIDERS[id].label;
  if (id === "email") return "Email and password";
  return id.charAt(0).toUpperCase() + id.slice(1);
}

/** Cookie the server sets before a redirect so the next page can confirm what happened. */
export const FLASH_COOKIE = "mn_flash";

/** Message for a flash key such as "signed-in:github", "welcome:google" or "email-confirmed". */
export function flashMessage(key: string): string | null {
  const [kind, provider] = key.split(":");
  const via = isOAuthProvider(provider) ? ` with ${OAUTH_PROVIDERS[provider].label}` : "";
  switch (kind) {
    case "signed-in":
      return `Signed in${via}.`;
    case "welcome":
      return `Account created${via}. Add a source to begin.`;
    case "email-confirmed":
      return "Email confirmed. Welcome!";
    default:
      return null;
  }
}
