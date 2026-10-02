export interface AuthUser {
  id: string;
  email: string;
  isAdmin: boolean;
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
  /** Complete an email link (PKCE `code` or `token_hash`) and start a session. */
  completeEmailLink(params: { code?: string; tokenHash?: string; type?: string }): Promise<{ error?: string }>;
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
