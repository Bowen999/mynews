import type { OAuthProvider } from "./providers";

export interface AuthUser {
  id: string;
  email: string;
  isAdmin: boolean;
  /** How the account can sign in: "email", "github", "google". */
  providers?: string[];
}

/** An account as the admin pages list it. Never carries credentials. */
export interface Account {
  id: string;
  email: string;
  isAdmin: boolean;
  /** How it can sign in: "email", "github", "google". */
  providers: string[];
  createdAt: string;
  lastSignInAt?: string;
  /** The email address is confirmed (always true for social sign-in and local accounts). */
  confirmed: boolean;
}

/** Minimal cookie access shared by route handlers, server components and the proxy. */
export interface CookieJar {
  getAll(): { name: string; value: string }[];
  set(name: string, value: string, options: CookieOptions): void;
}

export interface CookieOptions {
  path?: string;
  maxAge?: number;
  expires?: Date;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: "lax" | "strict" | "none" | boolean;
  domain?: string;
}

export interface AuthResult {
  user?: AuthUser;
  /** Sign-up succeeded but the email address must be confirmed first. */
  needsConfirmation?: boolean;
  error?: string;
}

/** Account backend: Supabase Auth in production, a file-backed store for local development. */
export interface AuthBackend {
  readonly kind: "supabase" | "local";
  getUser(): Promise<AuthUser | null>;
  signUp(email: string, password: string, redirectTo: string): Promise<AuthResult>;
  signIn(email: string, password: string): Promise<AuthResult>;
  signOut(): Promise<void>;
  requestPasswordReset(email: string, redirectTo: string): Promise<{ error?: string }>;
  updatePassword(password: string): Promise<{ error?: string }>;
  /** Complete an email link or a social sign-in (PKCE `code`, or `token_hash`) and start a session. */
  completeEmailLink(params: { code?: string; tokenHash?: string; type?: string }): Promise<{ error?: string; user?: AuthUser }>;
  /** Where to send the browser to sign in with a social provider (GitHub, Google). */
  oauthUrl(provider: OAuthProvider, redirectTo: string): Promise<{ url?: string; error?: string }>;
}

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly extra: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "HttpError";
  }
}
