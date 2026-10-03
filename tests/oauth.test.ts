import { afterEach, describe, expect, it, vi } from "vitest";
import { describeProviderError, enabledOAuthProviders, parseProviderList, resetOAuthProviderCache } from "../src/lib/auth/oauth";
import { signInProblem } from "../src/lib/auth/policy";
import { flashMessage, isOAuthProvider, providerLabel } from "../src/lib/auth/providers";
import { SupabaseAuth } from "../src/lib/auth/supabase";
import type { AuthUser, CookieJar, CookieOptions } from "../src/lib/auth/types";

const ENV_KEYS = ["SUPABASE_URL", "SUPABASE_ANON_KEY", "OAUTH_PROVIDERS", "ADMIN_EMAILS", "AUTH_ALLOWED_DOMAINS", "SIGNUPS_DISABLED"];
afterEach(() => {
  for (const k of ENV_KEYS) delete process.env[k];
  resetOAuthProviderCache();
});

const withSupabase = () => {
  process.env.SUPABASE_URL = "https://abcdefghijklmnopqrst.supabase.co";
  process.env.SUPABASE_ANON_KEY = "anon-key";
};

const settings = (external: Record<string, boolean>) =>
  vi.fn(async () => new Response(JSON.stringify({ external }), { status: 200, headers: { "Content-Type": "application/json" } }));

describe("social sign-in providers", () => {
  it("parses OAUTH_PROVIDERS in display order and ignores unknown names", () => {
    expect(parseProviderList(undefined)).toBeUndefined();
    expect(parseProviderList("google, GitHub")).toEqual(["github", "google"]);
    expect(parseProviderList("github wechat")).toEqual(["github"]);
    expect(parseProviderList("none")).toEqual([]);
  });

  it("offers nothing without Supabase Auth (local accounts are email-only)", async () => {
    process.env.OAUTH_PROVIDERS = "github,google";
    const fetchImpl = settings({ github: true });
    expect(await enabledOAuthProviders(fetchImpl)).toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("uses OAUTH_PROVIDERS when set, without asking Supabase", async () => {
    withSupabase();
    process.env.OAUTH_PROVIDERS = "google";
    const fetchImpl = settings({ github: true, google: true });
    expect(await enabledOAuthProviders(fetchImpl)).toEqual(["google"]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("otherwise reads the enabled providers from Supabase's settings, and caches them", async () => {
    withSupabase();
    const fetchImpl = settings({ github: true, google: false, email: true });
    expect(await enabledOAuthProviders(fetchImpl)).toEqual(["github"]);
    expect(await enabledOAuthProviders(fetchImpl)).toEqual(["github"]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://abcdefghijklmnopqrst.supabase.co/auth/v1/settings");
    expect((init.headers as Record<string, string>).apikey).toBe("anon-key");
  });

  it("shows no buttons when the settings can't be read", async () => {
    withSupabase();
    const failing = vi.fn(async () => {
      throw new Error("offline");
    });
    expect(await enabledOAuthProviders(failing)).toEqual([]);
  });

  it("labels providers and flash messages", () => {
    expect(isOAuthProvider("github")).toBe(true);
    expect(isOAuthProvider("toString")).toBe(false);
    expect(providerLabel("google")).toBe("Google");
    expect(providerLabel("email")).toBe("Email and password");
    expect(flashMessage("signed-in:github")).toBe("Signed in with GitHub.");
    expect(flashMessage("welcome:google")).toMatch(/^Account created with Google\./);
    expect(flashMessage("signed-in:evil")).toBe("Signed in.");
    expect(flashMessage("<script>")).toBeNull();
  });

  it("maps provider errors to short messages", () => {
    expect(describeProviderError("access_denied", "The user has denied your application access.")).toBe("Sign-in was cancelled.");
    expect(describeProviderError("access_denied", "Signups not allowed for this instance")).toBe("New sign-ups are currently closed.");
    expect(describeProviderError("server_error", "Error getting user email from external provider")).toMatch(/verified email/);
    expect(describeProviderError("validation_failed", "Unsupported provider: provider is not enabled")).toMatch(/not available/);
    expect(describeProviderError(null, null)).toBe("Sign-in didn’t complete. Try again.");
  });
});

describe("sign-in policy after a callback", () => {
  const user = (email: string, isAdmin = false): AuthUser => ({ id: "u1", email, isAdmin });

  it("applies the allow-list", () => {
    process.env.AUTH_ALLOWED_DOMAINS = "ualberta.ca";
    expect(signInProblem(user("someone@ualberta.ca"), true)).toBeNull();
    expect(signInProblem(user("someone@gmail.com"), false)).toMatch(/not on the list/);
  });

  it("lets only existing accounts and admins in while sign-ups are closed", () => {
    process.env.SIGNUPS_DISABLED = "1";
    expect(signInProblem(user("old@example.com"), false)).toBeNull();
    expect(signInProblem(user("new@example.com"), true)).toMatch(/sign-ups are currently closed/);
    expect(signInProblem(user("boss@example.com", true), true)).toBeNull();
  });
});

describe("SupabaseAuth.oauthUrl", () => {
  it("builds a PKCE authorize URL and stores the code verifier in a cookie", async () => {
    withSupabase();
    const cookies = new Map<string, string>();
    const jar: CookieJar = {
      getAll: () => [...cookies].map(([name, value]) => ({ name, value })),
      set: (name: string, value: string, options: CookieOptions) => {
        if (options.maxAge === 0 || !value) cookies.delete(name);
        else cookies.set(name, value);
      },
    };
    const { url, error } = await new SupabaseAuth(jar).oauthUrl("github", "https://app.example.com/auth/callback?next=%2Fprofile&via=github");
    expect(error).toBeUndefined();
    const authorize = new URL(url!);
    expect(authorize.origin + authorize.pathname).toBe("https://abcdefghijklmnopqrst.supabase.co/auth/v1/authorize");
    expect(authorize.searchParams.get("provider")).toBe("github");
    expect(authorize.searchParams.get("redirect_to")).toBe("https://app.example.com/auth/callback?next=%2Fprofile&via=github");
    expect(authorize.searchParams.get("code_challenge")).toBeTruthy();
    expect(authorize.searchParams.get("code_challenge_method")?.toLowerCase()).toBe("s256");
    expect([...cookies.keys()].some((name) => name.endsWith("-code-verifier"))).toBe(true);
  });
});
