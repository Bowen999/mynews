import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { createSessionToken, hashPassword, LocalAuth, LOCAL_SESSION_COOKIE, readSessionToken, verifyPassword } from "../src/lib/auth/local";
import { isAdminEmail, isEmailAllowed, passwordProblem, safeNext } from "../src/lib/auth/policy";
import { describeAuthError } from "../src/lib/auth/supabase";
import type { CookieJar, CookieOptions } from "../src/lib/auth/types";
import { topicUrl } from "../src/lib/notify";

const dir = mkdtempSync(path.join(os.tmpdir(), "mynews-auth-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const ENV_KEYS = ["ADMIN_EMAILS", "AUTH_ALLOWED_EMAILS", "AUTH_ALLOWED_DOMAINS"];
afterEach(() => {
  for (const k of ENV_KEYS) delete process.env[k];
});

/** In-memory cookie jar that behaves like a browser between requests. */
function browser() {
  const cookies = new Map<string, string>();
  const jar: CookieJar = {
    getAll: () => [...cookies].map(([name, value]) => ({ name, value })),
    set: (name: string, value: string, options: CookieOptions) => {
      if (options.maxAge === 0 || !value) cookies.delete(name);
      else cookies.set(name, value);
    },
  };
  return { jar, cookies };
}

describe("passwords and sessions", () => {
  it("hashes with scrypt and verifies", async () => {
    const h = await hashPassword("correct horse");
    expect(h.startsWith("scrypt$")).toBe(true);
    expect(await verifyPassword("correct horse", h)).toBe(true);
    expect(await verifyPassword("wrong", h)).toBe(false);
    expect(await hashPassword("correct horse")).not.toBe(h); // salted
  });

  it("signs session tokens and rejects tampering and expiry", () => {
    const t = createSessionToken("u_1", "secret", 1000);
    expect(readSessionToken(t, "secret", 2000)).toBe("u_1");
    expect(readSessionToken(t, "other-secret", 2000)).toBeNull();
    const [payload, sig] = t.split(".");
    const forged = Buffer.from(JSON.stringify({ uid: "u_admin", exp: 9e15 })).toString("base64url");
    expect(readSessionToken(`${forged}.${sig}`, "secret", 2000)).toBeNull();
    expect(readSessionToken(`${payload}.${sig}`, "secret", 1000 + 31 * 86400e3)).toBeNull();
    expect(readSessionToken(undefined, "secret")).toBeNull();
  });
});

describe("LocalAuth", () => {
  it("signs up, keeps a session, signs out and signs back in", async () => {
    process.env.ADMIN_EMAILS = "owner@example.com";
    const a = browser();
    const auth = new LocalAuth(a.jar, dir, "s");
    const res = await auth.signUp("Owner@Example.com", "password123");
    expect(res.user).toMatchObject({ email: "owner@example.com", isAdmin: true });
    expect(a.cookies.has(LOCAL_SESSION_COOKIE)).toBe(true);
    expect((await new LocalAuth(a.jar, dir, "s").getUser())?.email).toBe("owner@example.com");

    expect((await auth.signUp("owner@example.com", "password456")).error).toMatch(/already exists/);

    await auth.signOut();
    expect(await new LocalAuth(a.jar, dir, "s").getUser()).toBeNull();

    const b = browser();
    expect((await new LocalAuth(b.jar, dir, "s").signIn("owner@example.com", "nope")).error).toMatch(/Incorrect/);
    expect((await new LocalAuth(b.jar, dir, "s").signIn("owner@example.com", "password123")).user?.email).toBe("owner@example.com");
    expect((await new LocalAuth(b.jar, dir, "s").updatePassword("newpassword1")).error).toBeUndefined();
    expect((await new LocalAuth(browser().jar, dir, "s").signIn("owner@example.com", "newpassword1")).user).toBeTruthy();
  });

  it("ignores session cookies signed with another secret", async () => {
    const a = browser();
    await new LocalAuth(a.jar, dir, "s").signUp("carol@example.com", "password123");
    expect(await new LocalAuth(a.jar, dir, "different").getUser()).toBeNull();
  });
});

describe("access policy", () => {
  it("allows everyone when no allow-list is configured", () => {
    expect(isEmailAllowed("anyone@example.org")).toBe(true);
  });
  it("restricts to allowed emails and domains, but always admits admins", () => {
    process.env.AUTH_ALLOWED_EMAILS = "friend@gmail.com";
    process.env.AUTH_ALLOWED_DOMAINS = "ualberta.ca";
    process.env.ADMIN_EMAILS = "boss@elsewhere.com";
    expect(isEmailAllowed("Friend@Gmail.com")).toBe(true);
    expect(isEmailAllowed("someone@ualberta.ca")).toBe(true);
    expect(isEmailAllowed("someone@cs.ualberta.ca")).toBe(true);
    expect(isEmailAllowed("someone@notualberta.ca")).toBe(false);
    expect(isEmailAllowed("stranger@gmail.com")).toBe(false);
    expect(isEmailAllowed("boss@elsewhere.com")).toBe(true);
    expect(isAdminEmail("BOSS@elsewhere.com")).toBe(true);
  });
  it("validates passwords and redirect targets", () => {
    expect(passwordProblem("short")).toMatch(/8/);
    expect(passwordProblem("long enough")).toBeNull();
    expect(safeNext("/editions/1")).toBe("/editions/1");
    expect(safeNext("//evil.com")).toBe("/");
    expect(safeNext("https://evil.com")).toBe("/");
    expect(safeNext("/\\evil.com")).toBe("/");
  });
  it("maps Supabase auth errors to readable messages", () => {
    expect(describeAuthError("Invalid login credentials")).toBe("Incorrect email or password.");
    expect(describeAuthError("User already registered")).toMatch(/already exists/);
    expect(describeAuthError("Email rate limit exceeded")).toMatch(/Too many/);
  });
});

describe("personal ntfy topics", () => {
  it("accepts topic names and ntfy.sh links only", () => {
    expect(topicUrl("my-topic_1")).toBe("https://ntfy.sh/my-topic_1");
    expect(topicUrl("https://ntfy.sh/my-topic")).toBe("https://ntfy.sh/my-topic");
    expect(topicUrl("https://evil.example.com/x")).toBeNull();
    expect(topicUrl("http://169.254.169.254/latest")).toBeNull();
    expect(topicUrl("has spaces")).toBeNull();
    expect(topicUrl("")).toBeNull();
  });
});
