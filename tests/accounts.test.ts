import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { profileForUser } from "../src/lib/accounts";
import { notifyTargets } from "../src/lib/pipeline/runner";
import { checkQuota } from "../src/lib/quota";
import { FileStore } from "../src/lib/store/file";
import { defaultPreferences, type Run } from "../src/lib/types";

const dir = mkdtempSync(path.join(os.tmpdir(), "mynews-accounts-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
afterEach(() => {
  delete process.env.USER_WEEKLY_RUN_LIMIT;
  delete process.env.GLOBAL_DAILY_RUN_LIMIT;
});

const store = new FileStore(dir);
const user = (id: string, isAdmin = false) => ({ id, email: `${id}@example.com`, isAdmin });

function run(id: string, profileId: string, createdAt: string): Run {
  return {
    id,
    profileId,
    status: "completed",
    stage: "publish",
    progress: [],
    log: [],
    state: {},
    windowStart: createdAt,
    windowEnd: createdAt,
    createdAt,
    updatedAt: createdAt,
  };
}

describe("profiles", () => {
  it("creates one profile per account and returns it again", async () => {
    const p1 = await profileForUser(user("u1"), store);
    const p2 = await profileForUser(user("u1"), store);
    const other = await profileForUser(user("u2"), store);
    expect(p1.id).toBe("u1");
    expect(p1.ownerId).toBe("u1");
    expect(p2.id).toBe(p1.id);
    expect(other.id).toBe("u2");
  });

  it("lets the first admin adopt the profile from the single-user version", async () => {
    const now = new Date().toISOString();
    await store.saveProfile({ id: "default", name: "Old", sources: [{ id: "s", url: "https://a.example.com", addedAt: now }], interest: null, preferences: defaultPreferences(), createdAt: now, updatedAt: now });
    const regular = await profileForUser(user("u3"), store);
    expect(regular.id).toBe("u3");
    const admin = await profileForUser(user("boss", true), store);
    expect(admin.id).toBe("default");
    expect(admin.ownerId).toBe("boss");
    expect(admin.sources).toHaveLength(1);
    const again = await profileForUser(user("other-admin", true), store);
    expect(again.id).toBe("other-admin");
  });
});

describe("quotas", () => {
  const now = Date.parse("2026-10-02T12:00:00Z");
  const iso = (daysAgo: number) => new Date(now - daysAgo * 86400e3).toISOString();

  it("counts runs in the rolling week and reports when the next slot opens", async () => {
    process.env.USER_WEEKLY_RUN_LIMIT = "2";
    const u = user("q1");
    const p = await profileForUser(u, store);
    await store.createRun(run("r1", p.id, iso(8)));
    expect((await checkQuota(u, p, store, now)).allowed).toBe(true);
    await store.createRun(run("r2", p.id, iso(3)));
    await store.createRun(run("r3", p.id, iso(1.5)));
    const q = await checkQuota(u, p, store, now);
    expect(q).toMatchObject({ allowed: false, used: 2, limit: 2 });
    expect(q.nextSlotAt).toBe(new Date(now + 4 * 86400e3).toISOString());
    expect((await checkQuota({ ...u, isAdmin: true }, p, store, now)).allowed).toBe(true);
  });

  it("applies the global daily cap across accounts", async () => {
    process.env.GLOBAL_DAILY_RUN_LIMIT = "3";
    const u = user("q2");
    const p = await profileForUser(u, store);
    await store.createRun(run("g1", "x", iso(0.1)));
    await store.createRun(run("g2", "y", iso(0.2)));
    expect((await checkQuota(u, p, store, now)).allowed).toBe(true);
    await store.createRun(run("g3", "z", iso(0.3)));
    const q = await checkQuota(u, p, store, now);
    expect(q.allowed).toBe(false);
    expect(q.reason).toMatch(/daily/);
  });

  it("can be disabled with 0", async () => {
    process.env.USER_WEEKLY_RUN_LIMIT = "0";
    process.env.GLOBAL_DAILY_RUN_LIMIT = "0";
    const u = user("q1");
    const p = await profileForUser(u, store);
    expect((await checkQuota(u, p, store, now)).allowed).toBe(true);
  });
});

describe("notification targets", () => {
  it("sends to the personal topic, adds the owner topic for admins and alerts the owner about others' failures", async () => {
    const p = await profileForUser(user("n1"), store);
    p.preferences.ntfyTopic = "alice-briefing";
    expect(notifyTargets(user("n1"), p)).toEqual({ topics: ["https://ntfy.sh/alice-briefing"], ownerAlerts: true });
    expect(notifyTargets(user("n1", true), p)).toEqual({ topics: ["https://ntfy.sh/alice-briefing", "https://ntfy.sh/lipid-plus"], ownerAlerts: false });
    p.preferences.ntfyTopic = undefined;
    expect(notifyTargets(user("n1"), p)).toEqual({ topics: [], ownerAlerts: true });
  });
});
