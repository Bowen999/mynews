import { config } from "../config";

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
