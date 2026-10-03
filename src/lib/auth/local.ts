import { createHmac, randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { config } from "../config";
import { newId } from "../util/text";
import { isAdminEmail, normalizeEmail } from "./policy";
import type { AuthBackend, AuthResult, AuthUser, CookieJar } from "./types";

const scrypt = promisify(scryptCb) as (password: string, salt: Buffer, keylen: number) => Promise<Buffer>;

export const LOCAL_SESSION_COOKIE = "mn_session";
const SESSION_DAYS = 30;

interface LocalUserRecord {
  id: string;
  email: string;
  passwordHash: string;
  createdAt: string;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, 32);
  return `scrypt$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algo, saltB64, hashB64] = stored.split("$");
  if (algo !== "scrypt" || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, "base64");
  const actual = await scrypt(password, Buffer.from(saltB64, "base64"), expected.length);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function createSessionToken(userId: string, secret: string, now = Date.now()): string {
  const payload = Buffer.from(JSON.stringify({ uid: userId, exp: now + SESSION_DAYS * 86400e3 })).toString("base64url");
  return `${payload}.${sign(payload, secret)}`;
}

export function readSessionToken(token: string | undefined, secret: string, now = Date.now()): string | null {
  if (!token) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const expected = sign(payload, secret);
  if (expected.length !== sig.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(sig))) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { uid?: string; exp?: number };
    if (!data.uid || !data.exp || data.exp < now) return null;
    return data.uid;
  } catch {
    return null;
  }
}

/**
 * File-backed accounts for local development and tests (no email delivery, so no password
 * reset by email). Never used when Supabase Auth is configured.
 */
export class LocalAuth implements AuthBackend {
  readonly kind = "local" as const;
  private readonly file: string;

  constructor(
    private readonly jar: CookieJar,
    dataDir: string,
    private readonly secret = config.auth.localSecret,
  ) {
    this.file = path.join(dataDir, "users.json");
  }

  private async users(): Promise<LocalUserRecord[]> {
    try {
      return JSON.parse(await fs.readFile(this.file, "utf8")) as LocalUserRecord[];
    } catch {
      return [];
    }
  }

  private async saveUsers(users: LocalUserRecord[]): Promise<void> {
    await fs.mkdir(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.${process.pid}.${Date.now()}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(users, null, 1));
    await fs.rename(tmp, this.file);
  }

  private toUser(r: LocalUserRecord): AuthUser {
    return { id: r.id, email: r.email, isAdmin: isAdminEmail(r.email), providers: ["email"] };
  }

  private startSession(userId: string) {
    this.jar.set(LOCAL_SESSION_COOKIE, createSessionToken(userId, this.secret), {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: SESSION_DAYS * 86400,
    });
  }

  async getUser(): Promise<AuthUser | null> {
    const token = this.jar.getAll().find((c) => c.name === LOCAL_SESSION_COOKIE)?.value;
    const uid = readSessionToken(token, this.secret);
    if (!uid) return null;
    const record = (await this.users()).find((u) => u.id === uid);
    return record ? this.toUser(record) : null;
  }

  async signUp(email: string, password: string): Promise<AuthResult> {
    const e = normalizeEmail(email);
    const users = await this.users();
    if (users.some((u) => u.email === e)) return { error: "An account with this email already exists. Sign in instead." };
    const record: LocalUserRecord = { id: newId("u"), email: e, passwordHash: await hashPassword(password), createdAt: new Date().toISOString() };
    await this.saveUsers([...users, record]);
    this.startSession(record.id);
    return { user: this.toUser(record) };
  }

  async signIn(email: string, password: string): Promise<AuthResult> {
    const record = (await this.users()).find((u) => u.email === normalizeEmail(email));
    if (!record || !(await verifyPassword(password, record.passwordHash))) return { error: "Incorrect email or password." };
    this.startSession(record.id);
    return { user: this.toUser(record) };
  }

  async signOut(): Promise<void> {
    this.jar.set(LOCAL_SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  }

  async requestPasswordReset(): Promise<{ error?: string }> {
    return { error: "Password reset by email needs Supabase Auth (not configured in this local setup)." };
  }

  async updatePassword(password: string): Promise<{ error?: string }> {
    const current = await this.getUser();
    if (!current) return { error: "Sign in first." };
    const users = await this.users();
    const record = users.find((u) => u.id === current.id);
    if (!record) return { error: "Account not found." };
    record.passwordHash = await hashPassword(password);
    await this.saveUsers(users);
    return {};
  }

  async completeEmailLink(): Promise<{ error?: string }> {
    return { error: "Email links are only used with Supabase Auth." };
  }

  async oauthUrl(): Promise<{ url?: string; error?: string }> {
    return { error: "Signing in with GitHub or Google needs Supabase Auth (not configured in this local setup)." };
  }
}
