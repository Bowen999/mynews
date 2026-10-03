import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { User } from "@supabase/supabase-js";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { median, overview, userDetail, userRows } from "../src/lib/admin";
import { accountFromSupabaseUser } from "../src/lib/auth/directory";
import { listLocalAccounts, LocalAuth } from "../src/lib/auth/local";
import type { Account, CookieJar } from "../src/lib/auth/types";
import { FileStore } from "../src/lib/store/file";
import { adminSnapshotFromRows, fetchPages } from "../src/lib/store/supabase";
import type { AdminSnapshot } from "../src/lib/store/types";
import { formatAgo, formatDate, formatDuration } from "../src/lib/util/dates";

const dir = mkdtempSync(path.join(os.tmpdir(), "mynews-admin-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
afterEach(() => {
  delete process.env.ADMIN_EMAILS;
});

const now = Date.parse("2026-10-03T12:00:00Z");
const ago = (hours: number) => new Date(now - hours * 3600e3).toISOString();

const accounts: Account[] = [
  { id: "u_admin", email: "admin@example.com", isAdmin: true, providers: ["email", "github"], createdAt: ago(60 * 24), lastSignInAt: ago(24), confirmed: true },
  { id: "u_alice", email: "alice@example.com", isAdmin: false, providers: ["email"], createdAt: ago(20 * 24), lastSignInAt: ago(10 * 24), confirmed: true },
  { id: "u_bob", email: "bob@example.com", isAdmin: false, providers: ["google"], createdAt: ago(3 * 24), lastSignInAt: ago(3 * 24), confirmed: true },
  { id: "u_carol", email: "carol@example.com", isAdmin: false, providers: ["email"], createdAt: ago(40 * 24), confirmed: false },
];

type R = AdminSnapshot["runs"][number];
const run = (id: string, profileId: string, status: R["status"], hoursAgo: number, minutes?: number, error?: string): R => ({
  id,
  profileId,
  status,
  stage: status === "completed" ? "publish" : "search",
  createdAt: ago(hoursAgo),
  finishedAt: minutes === undefined ? undefined : new Date(now - hoursAgo * 3600e3 + minutes * 60e3).toISOString(),
  error,
});

const snapshot: AdminSnapshot = {
  profiles: [
    // The admin owns the profile of the earlier single-user version.
    { id: "default", ownerId: "u_admin", createdAt: ago(60 * 24), updatedAt: ago(5), sources: 2, interest: true, ntfy: true },
    { id: "u_alice", ownerId: "u_alice", createdAt: ago(20 * 24), updatedAt: ago(30), sources: 1, interest: true, ntfy: false },
    { id: "u_bob", ownerId: "u_bob", createdAt: ago(3 * 24), updatedAt: ago(3 * 24), sources: 0, interest: false, ntfy: false },
    { id: "gone", ownerId: "u_deleted", createdAt: ago(50 * 24), updatedAt: ago(50 * 24), sources: 1, interest: false, ntfy: false },
  ],
  runs: [
    run("r1", "u_alice", "completed", 48, 3),
    run("r2", "u_alice", "failed", 30, 1, "No relevant stories were found."),
    run("r3", "u_alice", "completed", 10 * 24, 5),
    run("r4", "default", "completed", 3, 2),
    run("r5", "gone", "failed", 5 * 24, 1, "DeepSeek key missing"),
    run("r6", "u_alice", "failed", 40 * 24, 1, "Too old to count"),
    run("r7", "default", "running", 1 / 6),
  ],
  editions: [
    { id: "e1", profileId: "u_alice", number: 1, createdAt: ago(10 * 24), sample: false },
    { id: "e2", profileId: "u_alice", number: 2, createdAt: ago(48), sample: true },
    { id: "e3", profileId: "default", number: 7, createdAt: ago(3), sample: false },
  ],
  interactions: [
    { profileId: "u_alice", kind: "open", at: ago(48) },
    { profileId: "u_alice", kind: "open", at: ago(48) },
    { profileId: "u_alice", kind: "open", at: ago(48) },
    { profileId: "u_alice", kind: "source", at: ago(48) },
    { profileId: "default", kind: "open", at: ago(24) },
    { profileId: "default", kind: "open", at: ago(15 * 24) },
  ],
  feedback: [
    { profileId: "u_alice", signal: 1, at: ago(48) },
    { profileId: "u_alice", signal: -1, at: ago(48) },
  ],
  truncated: false,
};

describe("overview", () => {
  const ov = overview(snapshot, accounts, now);

  it("counts users, new sign-ups and who was active this week", () => {
    expect(ov.users).toEqual({ total: 4, admins: 1, newWeek: 1, newMonth: 2, activeWeek: 3, neverGenerated: 2 });
  });

  it("counts generations and the last 30 days' outcome", () => {
    expect(ov.runs.total).toBe(7);
    expect(ov.runs.day).toBe(2); // r4 and r7
    expect(ov.runs.week).toBe(5); // r1, r2, r4, r5, r7
    expect(ov.runs.failedMonth).toBe(2); // r2 and r5; r6 is older
    expect(ov.runs.successRate).toBeCloseTo(3 / 5);
    expect(ov.runs.medianMs).toBe(3 * 60e3); // 2, 3 and 5 minutes
    expect(ov.editions).toEqual({ total: 3, week: 2 });
  });

  it("counts reading in the last 7 days only", () => {
    expect(ov.reading).toEqual({ opens: 4, sourceClicks: 1, liked: 1, disliked: 1 });
  });

  it("shows how far people get", () => {
    expect(ov.funnel).toEqual({ signedUp: 4, addedSources: 2, gotEdition: 2, opened: 2 });
  });

  it("buckets generations per UTC day for the last 30 days", () => {
    expect(ov.daily).toHaveLength(30);
    expect(ov.daily.at(-1)).toEqual({ day: "2026-10-03", completed: 1, failed: 0, other: 1 });
    expect(ov.daily.find((d) => d.day === "2026-10-02")).toMatchObject({ failed: 1 });
    expect(ov.daily.find((d) => d.day === "2026-10-01")).toMatchObject({ completed: 1 });
    expect(ov.daily.reduce((n, d) => n + d.completed + d.failed + d.other, 0)).toBe(6); // r6 is older than 30 days
  });

  it("groups recent failures by message", () => {
    expect(ov.failures.map((f) => [f.message, f.count, f.users])).toEqual([
      ["No relevant stories were found.", 1, 1],
      ["DeepSeek key missing", 1, 1],
    ]);
  });

  it("lists the newest generations with the account that ran them", () => {
    expect(ov.recent[0]).toMatchObject({ id: "r7", status: "running", email: "admin@example.com", durationMs: null });
    expect(ov.recent.find((r) => r.id === "r5")?.email).toBeNull(); // its account was removed
    expect(ov.recent.find((r) => r.id === "r1")?.durationMs).toBe(3 * 60e3);
  });

  it("is empty-safe", () => {
    const empty = overview({ profiles: [], runs: [], editions: [], interactions: [], feedback: [], truncated: true }, [], now);
    expect(empty.runs).toMatchObject({ total: 0, successRate: null, medianMs: null });
    expect(empty.daily).toHaveLength(30);
    expect(empty.failures).toEqual([]);
    expect(empty.truncated).toBe(true);
  });
});

describe("users", () => {
  const rows = userRows(snapshot, accounts, now);
  const by = (id: string) => rows.find((r) => r.id === id)!;

  it("joins each account to its profile through the profile's owner", () => {
    expect(rows).toHaveLength(4); // the removed account's profile is not listed
    expect(by("u_admin")).toMatchObject({ editions: 1, runs: 2, runsWeek: 2, sources: 2, interest: true, ntfy: true, hasProfile: true });
    expect(by("u_alice")).toMatchObject({ editions: 2, runs: 4, runsWeek: 2, failedMonth: 1, opens: 3, liked: 1, disliked: 1, sources: 1 });
  });

  it("knows the last generation and the last activity", () => {
    expect(by("u_alice")).toMatchObject({ lastRunAt: ago(30), lastRunStatus: "failed", lastActiveAt: ago(30) });
    expect(by("u_admin").lastRunStatus).toBe("running");
    expect(by("u_bob").lastActiveAt).toBe(ago(3 * 24)); // only the sign-in
  });

  it("handles an account that never opened the app", () => {
    expect(by("u_carol")).toMatchObject({ hasProfile: false, runs: 0, editions: 0, sources: 0, lastActiveAt: null, lastRunAt: null, confirmed: false });
  });
});

describe("one user", () => {
  it("lists their generations newest first, with their weekly allowance", () => {
    const d = userDetail("u_alice", snapshot, accounts, now, 3)!;
    expect(d.runs.map((r) => r.id)).toEqual(["r2", "r1", "r3", "r6"]);
    expect(d.editions.map((e) => e.number)).toEqual([2, 1]);
    expect(d.quota).toEqual({ used: 2, limit: 3 });
    expect(d.runs.every((r) => r.email === "alice@example.com")).toBe(true);
  });

  it("gives admins no limit, and unknown ids nothing", () => {
    expect(userDetail("u_admin", snapshot, accounts, now, 3)!.quota).toEqual({ used: 2, limit: null });
    expect(userDetail("u_admin", snapshot, accounts, now, 0)!.quota.limit).toBeNull();
    expect(userDetail("u_alice", snapshot, accounts, now, 0)!.quota.limit).toBeNull(); // limit switched off
    expect(userDetail("gone", snapshot, accounts, now, 3)).toBeNull(); // a profile id is not an account id
    expect(userDetail("nobody", snapshot, accounts, now, 3)).toBeNull();
  });

  it("shows another account's activity only as counts and times", () => {
    const text = JSON.stringify(userDetail("u_alice", snapshot, accounts, now, 3));
    expect(text).not.toMatch(/headline|summary|itemTitle|passwordHash|https?:/); // "sources" is only a count
  });
});

describe("median", () => {
  it("handles empty, odd and even lists", () => {
    expect(median([])).toBeNull();
    expect(median([5, 1, 3])).toBe(3);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });
});

describe("accounts", () => {
  it("lists local accounts without their password hashes", async () => {
    process.env.ADMIN_EMAILS = "boss@example.com";
    writeFileSync(
      path.join(dir, "users.json"),
      JSON.stringify([
        { id: "u1", email: "boss@example.com", passwordHash: "scrypt$secret$hash", createdAt: "2026-09-01T00:00:00.000Z", lastSignInAt: "2026-09-30T00:00:00.000Z" },
        { id: "u2", email: "a@example.com", passwordHash: "scrypt$secret$hash2", createdAt: "2026-09-02T00:00:00.000Z" },
      ]),
    );
    const list = await listLocalAccounts(dir);
    expect(list).toEqual([
      { id: "u1", email: "boss@example.com", isAdmin: true, providers: ["email"], createdAt: "2026-09-01T00:00:00.000Z", lastSignInAt: "2026-09-30T00:00:00.000Z", confirmed: true },
      { id: "u2", email: "a@example.com", isAdmin: false, providers: ["email"], createdAt: "2026-09-02T00:00:00.000Z", lastSignInAt: undefined, confirmed: true },
    ]);
    expect(JSON.stringify(list)).not.toMatch(/scrypt|secret|passwordHash/);
    expect(await listLocalAccounts(path.join(dir, "missing"))).toEqual([]);
  });

  it("local sign-in records when the account last signed in", async () => {
    const sub = mkdtempSync(path.join(dir, "auth-"));
    const cookies = new Map<string, string>();
    const jar: CookieJar = {
      getAll: () => [...cookies].map(([name, value]) => ({ name, value })),
      set: (name, value) => void cookies.set(name, value),
    };
    const auth = new LocalAuth(jar, sub);
    expect((await auth.signUp("new@example.com", "password123")).user).toBeDefined();
    const [first] = await listLocalAccounts(sub);
    expect(first.lastSignInAt).toBe(first.createdAt);
    await new Promise((r) => setTimeout(r, 15));
    expect((await auth.signIn("new@example.com", "password123")).user).toBeDefined();
    const [second] = await listLocalAccounts(sub);
    expect(Date.parse(second.lastSignInAt!)).toBeGreaterThan(Date.parse(first.createdAt));
  });

  it("maps Supabase Auth users", () => {
    const user = {
      id: "7d1c",
      email: "Mixed.Case@Example.com",
      created_at: "2026-09-01T10:00:00Z",
      last_sign_in_at: "2026-10-01T10:00:00Z",
      email_confirmed_at: "2026-09-01T10:05:00Z",
      app_metadata: { provider: "email", providers: ["email", "github"] },
    } as unknown as User;
    expect(accountFromSupabaseUser(user)).toEqual({
      id: "7d1c",
      email: "mixed.case@example.com",
      isAdmin: false,
      providers: ["email", "github"],
      createdAt: "2026-09-01T10:00:00Z",
      lastSignInAt: "2026-10-01T10:00:00Z",
      confirmed: true,
    });
    const social = { id: "x", email: "g@example.com", created_at: "2026-09-02T00:00:00Z", app_metadata: { provider: "google" } } as unknown as User;
    expect(accountFromSupabaseUser(social)).toMatchObject({ providers: ["google"], confirmed: false, lastSignInAt: undefined });
    expect(accountFromSupabaseUser({ id: "phone", created_at: "2026-09-02T00:00:00Z", app_metadata: {} } as unknown as User)).toBeNull();
  });
});

describe("the file store's admin snapshot", () => {
  it("returns ids, times and counts, and only recent reading", async () => {
    const sub = mkdtempSync(path.join(dir, "store-"));
    const store = new FileStore(sub);
    const at = "2026-10-01T00:00:00.000Z";
    await store.saveProfile({
      id: "p1",
      ownerId: "u1",
      name: "Secret Name",
      sources: [{ id: "s", url: "https://private.example/lab", addedAt: at }],
      interest: { summary: "Private interests" } as never,
      preferences: { ntfyTopic: " my-topic " } as never,
      createdAt: at,
      updatedAt: at,
    });
    await store.createRun({
      id: "r1",
      profileId: "p1",
      status: "failed",
      stage: "search",
      progress: [],
      log: [{ at, level: "info", message: "Private log line" }],
      state: {},
      windowStart: at,
      windowEnd: at,
      error: "boom",
      createdAt: at,
      updatedAt: at,
      finishedAt: at,
    });
    await store.saveEdition(
      { id: "e1", profileId: "p1", runId: "r1", number: 1, headline: "Private headline", dek: "", themes: [], windowStart: at, windowEnd: at, createdAt: at, items: [], alsoNoted: [], stats: {} as never, profileSummary: "", model: { provider: "m", model: "m" }, sample: true },
      "<html></html>",
    );
    await store.addInteraction({ id: "i-old", profileId: "p1", editionId: "e1", itemId: "a", category: "paper", kind: "open", createdAt: "2026-08-01T00:00:00.000Z" });
    await store.addInteraction({ id: "i-new", profileId: "p1", editionId: "e1", itemId: "a", category: "paper", kind: "source", createdAt: at });
    await store.setFeedback({ id: "f1", profileId: "p1", editionId: "e1", itemId: "a", itemTitle: "Private title", category: "paper", signal: -1, createdAt: at });

    const snap = await store.adminSnapshot("2026-09-01T00:00:00.000Z");
    expect(snap.profiles).toEqual([{ id: "p1", ownerId: "u1", createdAt: at, updatedAt: at, sources: 1, interest: true, ntfy: true }]);
    expect(snap.runs).toEqual([{ id: "r1", profileId: "p1", status: "failed", stage: "search", createdAt: at, finishedAt: at, error: "boom", editionId: undefined }]);
    expect(snap.editions).toEqual([{ id: "e1", profileId: "p1", number: 1, createdAt: at, sample: true }]);
    expect(snap.interactions).toEqual([{ profileId: "p1", kind: "source", at }]); // the August one is before `since`
    expect(snap.feedback).toEqual([{ profileId: "p1", signal: -1, at }]);
    expect(snap.truncated).toBe(false);
    expect(JSON.stringify(snap)).not.toMatch(/Private|private\.example|Secret Name|my-topic/);
  });
});

describe("the Supabase admin snapshot", () => {
  it("maps slim rows without reading content columns", () => {
    const snap = adminSnapshotFromRows({
      profiles: [
        { id: "p1", owner_id: "u1", created_at: "2026-09-01T00:00:00+00:00", updated_at: "2026-09-02T00:00:00+00:00", sources: [{}, {}], preferences: { ntfyTopic: "t" } },
        { id: "p2", owner_id: null, created_at: "2026-09-01T00:00:00+00:00", updated_at: "2026-09-01T00:00:00+00:00", sources: null, preferences: {} },
      ],
      withInterest: [{ id: "p1" }],
      runs: [{ id: "r1", profile_id: "p1", status: "completed", stage: "publish", created_at: "2026-09-03T00:00:00+00:00", finished_at: "2026-09-03T00:03:00+00:00", error: null, edition_id: "e1" }],
      editions: [{ id: "e1", profile_id: "p1", number: 3, created_at: "2026-09-03T00:03:00+00:00", sample: false }],
      interactions: [{ profile_id: "p1", kind: "open", created_at: "2026-09-04T00:00:00+00:00" }],
      feedback: [{ profile_id: "p1", signal: 1, created_at: "2026-09-04T00:00:00+00:00" }],
      truncated: true,
    });
    expect(snap.profiles).toEqual([
      { id: "p1", ownerId: "u1", createdAt: "2026-09-01T00:00:00+00:00", updatedAt: "2026-09-02T00:00:00+00:00", sources: 2, interest: true, ntfy: true },
      { id: "p2", ownerId: null, createdAt: "2026-09-01T00:00:00+00:00", updatedAt: "2026-09-01T00:00:00+00:00", sources: 0, interest: false, ntfy: false },
    ]);
    expect(snap.runs[0]).toEqual({ id: "r1", profileId: "p1", status: "completed", stage: "publish", createdAt: "2026-09-03T00:00:00+00:00", finishedAt: "2026-09-03T00:03:00+00:00", error: undefined, editionId: "e1" });
    expect(snap.editions[0]).toMatchObject({ number: 3, sample: false });
    expect(snap.truncated).toBe(true);
    // Postgres timestamps (with +00:00) work in the same calculations as ISO strings with Z.
    const ov = overview(snap, [{ id: "u1", email: "a@example.com", isAdmin: false, providers: ["email"], createdAt: "2026-09-01T00:00:00+00:00", confirmed: true }], Date.parse("2026-09-05T00:00:00Z"));
    expect(ov.runs.medianMs).toBe(3 * 60e3);
  });

  it("reads a table page by page and says when it stopped early", async () => {
    const calls: [number, number][] = [];
    const table = (rows: number) => (from: number, to: number) => {
      calls.push([from, to]);
      const data = Array.from({ length: Math.max(0, Math.min(to + 1, rows) - from) }, (_, i) => ({ id: from + i }));
      return Promise.resolve({ data, error: null });
    };
    const all = await fetchPages(table(2005), "test");
    expect(all.rows).toHaveLength(2005);
    expect(all.truncated).toBe(false);
    expect(calls).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);

    const cut = await fetchPages(table(5000), "test", 2000);
    expect(cut.rows).toHaveLength(2000);
    expect(cut.truncated).toBe(true);

    await expect(fetchPages(() => Promise.resolve({ data: null, error: { message: "permission denied", code: "42501" } }), "adminSnapshot runs")).rejects.toThrow(/permission denied/);
  });
});

describe("date helpers", () => {
  it("formats dates in UTC", () => {
    expect(formatDate("2026-09-04T23:30:00Z")).toBe("Sep 4, 2026");
    expect(formatDate("not a date")).toBe("");
    expect(formatDate(undefined)).toBe("");
  });

  it("says how long ago", () => {
    const t = (s: number) => new Date(now - s * 1000).toISOString();
    expect(formatAgo(t(20), now)).toBe("just now");
    expect(formatAgo(t(5 * 60), now)).toBe("5 min ago");
    expect(formatAgo(t(3 * 3600), now)).toBe("3 h ago");
    expect(formatAgo(t(2 * 86400), now)).toBe("2 d ago");
    expect(formatAgo(t(45 * 86400), now)).toBe("Aug 19, 2026");
    expect(formatAgo(t(-60), now)).toBe("just now"); // a clock a little ahead
  });

  it("formats durations", () => {
    expect(formatDuration(42e3)).toBe("42 s");
    expect(formatDuration(192e3)).toBe("3 min 12 s");
    expect(formatDuration(180e3)).toBe("3 min");
    expect(formatDuration(754e3)).toBe("12 min");
    expect(formatDuration(3900e3)).toBe("1 h 05 min");
  });
});
