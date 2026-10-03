import { config } from "../config";
import type { AuthUser } from "./types";

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export function isAdminEmail(email: string): boolean {
  return config.auth.adminEmails.includes(normalizeEmail(email));
}

/** Allow-list check. With no AUTH_ALLOWED_* settings everyone may use the app; admins always may. */
export function isEmailAllowed(email: string): boolean {
  const e = normalizeEmail(email);
  if (isAdminEmail(e)) return true;
  const emails = config.auth.allowedEmails;
  const domains = config.auth.allowedDomains;
  if (!emails.length && !domains.length) return true;
  const domain = e.split("@")[1] ?? "";
  return emails.includes(e) || domains.some((d) => domain === d || domain.endsWith(`.${d}`));
}

/**
 * Whether an account that just finished signing in through /auth/callback (GitHub, Google or an email
 * link) may use the app: the same allow-list as email sign-in, and while sign-ups are closed
 * (SIGNUPS_DISABLED) only existing accounts and admins.
 */
export function signInProblem(user: AuthUser, isNewAccount: boolean): string | null {
  if (!isEmailAllowed(user.email)) return "This email address is not on the list of allowed users.";
  if (isNewAccount && config.auth.signupsDisabled && !user.isAdmin) return "New sign-ups are currently closed.";
  return null;
}

export function passwordProblem(password: string): string | null {
  if (password.length < 8) return "Use at least 8 characters.";
  if (password.length > 128) return "Use at most 128 characters.";
  return null;
}

/** Only allow same-site relative redirects after sign-in. */
export function safeNext(next: string | null | undefined, fallback = "/"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next;
}
