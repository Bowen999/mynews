import { createServerClient } from "@supabase/ssr";
import type { EmailOtpType, SupabaseClient, User } from "@supabase/supabase-js";
import { config } from "../config";
import { isAdminEmail, normalizeEmail } from "./policy";
import type { OAuthProvider } from "./providers";
import type { AuthBackend, AuthResult, AuthUser, CookieJar } from "./types";

/** Map Supabase Auth errors to short user-facing messages. */
export function describeAuthError(message: string | undefined): string {
  const m = (message ?? "").toLowerCase();
  if (m.includes("invalid login credentials")) return "Incorrect email or password.";
  if (m.includes("email not confirmed")) return "Confirm your email address first: open the link we sent you.";
  if (m.includes("already registered") || m.includes("already been registered")) return "An account with this email already exists. Sign in instead.";
  if (m.includes("rate limit") || m.includes("too many")) return "Too many attempts. Wait a few minutes and try again.";
  if (m.includes("password") && m.includes("weak")) return "Choose a stronger password.";
  if (m.includes("signups not allowed") || m.includes("signup is disabled")) return "New sign-ups are currently closed.";
  return message ? message.slice(0, 200) : "Something went wrong. Try again.";
}

export function createSupabaseAuthClient(jar: CookieJar): SupabaseClient {
  return createServerClient(config.store.supabaseUrl!, config.auth.supabaseAnonKey!, {
    cookies: {
      getAll: () => jar.getAll(),
      setAll: (cookies) => {
        for (const c of cookies) jar.set(c.name, c.value, c.options as Parameters<CookieJar["set"]>[2]);
      },
    },
  });
}

/**
 * Supabase Auth, used only on the server with cookie-based sessions. The browser never talks to
 * Supabase directly, so the allow-list and quotas cannot be bypassed from the client.
 */
export class SupabaseAuth implements AuthBackend {
  readonly kind = "supabase" as const;
  private readonly client: SupabaseClient;

  constructor(jar: CookieJar) {
    this.client = createSupabaseAuthClient(jar);
  }

  private toUser(u: User | null | undefined): AuthUser | null {
    if (!u?.email) return null;
    const providers = Array.isArray(u.app_metadata?.providers) ? (u.app_metadata.providers as string[]) : undefined;
    return { id: u.id, email: normalizeEmail(u.email), isAdmin: isAdminEmail(u.email), providers };
  }

  async getUser(): Promise<AuthUser | null> {
    const { data, error } = await this.client.auth.getUser();
    if (error) return null;
    return this.toUser(data.user);
  }

  async signUp(email: string, password: string, redirectTo: string): Promise<AuthResult> {
    const { data, error } = await this.client.auth.signUp({ email, password, options: { emailRedirectTo: redirectTo } });
    if (error) return { error: describeAuthError(error.message) };
    if (!data.session) return { needsConfirmation: true };
    return { user: this.toUser(data.user) ?? undefined };
  }

  async signIn(email: string, password: string): Promise<AuthResult> {
    const { data, error } = await this.client.auth.signInWithPassword({ email, password });
    if (error) return { error: describeAuthError(error.message) };
    return { user: this.toUser(data.user) ?? undefined };
  }

  async signOut(): Promise<void> {
    await this.client.auth.signOut();
  }

  async requestPasswordReset(email: string, redirectTo: string): Promise<{ error?: string }> {
    const { error } = await this.client.auth.resetPasswordForEmail(email, { redirectTo });
    return error ? { error: describeAuthError(error.message) } : {};
  }

  async updatePassword(password: string): Promise<{ error?: string }> {
    const { error } = await this.client.auth.updateUser({ password });
    return error ? { error: describeAuthError(error.message) } : {};
  }

  async completeEmailLink(params: { code?: string; tokenHash?: string; type?: string }): Promise<{ error?: string; user?: AuthUser }> {
    if (params.code) {
      const { data, error } = await this.client.auth.exchangeCodeForSession(params.code);
      return error ? { error: describeAuthError(error.message) } : { user: this.toUser(data.user) ?? undefined };
    }
    if (params.tokenHash && params.type) {
      const { data, error } = await this.client.auth.verifyOtp({ token_hash: params.tokenHash, type: params.type as EmailOtpType });
      return error ? { error: describeAuthError(error.message) } : { user: this.toUser(data.user) ?? undefined };
    }
    return { error: "This link is incomplete or has expired." };
  }

  /** PKCE: the code verifier goes into a cookie here, and /auth/callback exchanges the returned code. */
  async oauthUrl(provider: OAuthProvider, redirectTo: string): Promise<{ url?: string; error?: string }> {
    const { data, error } = await this.client.auth.signInWithOAuth({ provider, options: { redirectTo, skipBrowserRedirect: true } });
    if (error || !data.url) return { error: describeAuthError(error?.message) };
    return { url: data.url };
  }
}
