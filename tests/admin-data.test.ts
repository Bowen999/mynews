import { beforeEach, describe, expect, it, vi } from "vitest";

// loadAdminData reads the store and the account list; each can fail without taking the other down.
const failing = vi.hoisted(() => ({ store: false, accounts: false }));

vi.mock("../src/lib/store", () => ({
  getStore: () => ({
    adminSnapshot: async (since: string) => {
      if (failing.store) throw new Error("Supabase adminSnapshot runs: tables are missing.");
      return { profiles: [], runs: [], editions: [], interactions: [], feedback: [], truncated: false, since };
    },
  }),
}));
vi.mock("../src/lib/auth/directory", () => ({
  listAccounts: async () => {
    if (failing.accounts) throw new Error("Listing accounts needs SUPABASE_SERVICE_ROLE_KEY.");
    return [{ id: "u1", email: "a@example.com", isAdmin: false, providers: ["email"], createdAt: "2026-09-01T00:00:00Z", confirmed: true }];
  },
}));

import { EVENT_DAYS, loadAdminData } from "../src/lib/admin";

beforeEach(() => {
  failing.store = false;
  failing.accounts = false;
});

describe("loadAdminData", () => {
  it("loads both and reads the last 30 days of reading and ratings", async () => {
    const before = Date.now();
    const data = await loadAdminData();
    expect(data.problems).toEqual([]);
    expect(data.snapshot).not.toBeNull();
    expect(data.accounts).toHaveLength(1);
    const since = Date.parse((data.snapshot as unknown as { since: string }).since);
    expect(Math.abs(since - (before - EVENT_DAYS * 86400e3))).toBeLessThan(5000);
  });

  it("explains a failed statistics query and still lists the accounts", async () => {
    failing.store = true;
    const data = await loadAdminData();
    expect(data.snapshot).toBeNull();
    expect(data.accounts).toHaveLength(1);
    expect(data.problems).toEqual(["Statistics unavailable. Supabase adminSnapshot runs: tables are missing."]);
  });

  it("explains a failed account list and still has the statistics", async () => {
    failing.accounts = true;
    const data = await loadAdminData();
    expect(data.accounts).toBeNull();
    expect(data.snapshot).not.toBeNull();
    expect(data.problems).toEqual(["Account list unavailable. Listing accounts needs SUPABASE_SERVICE_ROLE_KEY."]);
  });
});
