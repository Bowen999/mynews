import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { AuthUser } from "../src/lib/auth/types";
import type { Edition } from "../src/lib/types";

const dir = mkdtempSync(path.join(os.tmpdir(), "mynews-archive-"));
const session = vi.hoisted(() => ({ user: null as AuthUser | null }));

vi.mock("@/lib/session", async () => {
  const { HttpError } = await import("../src/lib/auth/types");
  return {
    requireUser: async () => {
      if (!session.user) throw new HttpError(401, "Please sign in.");
      return session.user;
    },
  };
});

beforeAll(() => {
  process.env.DATA_DIR = dir;
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const alice: AuthUser = { id: "u_alice", email: "alice@example.com", isAdmin: false };
const bob: AuthUser = { id: "u_bob", email: "bob@example.com", isAdmin: false };

function edition(id: string, profileId: string, number: number): Edition {
  const at = new Date(Date.UTC(2026, 9, number)).toISOString();
  return {
    id,
    profileId,
    runId: `run-${id}`,
    number,
    headline: `Edition ${number}`,
    dek: "",
    themes: [],
    windowStart: at,
    windowEnd: at,
    createdAt: at,
    items: [],
    alsoNoted: [],
    stats: {} as Edition["stats"],
    profileSummary: "",
    model: { provider: "mock", model: "mock" },
  };
}

describe("deleting an edition", () => {
  it("removes it with its ratings and reading history, and only for its owner", async () => {
    const { getStore } = await import("../src/lib/store");
    const { profileForUser } = await import("../src/lib/accounts");
    const { DELETE } = await import("../src/app/api/editions/[id]/route");
    const store = getStore();
    const profile = await profileForUser(alice, store);
    const at = new Date().toISOString();

    for (const [id, n] of [["e1", 1], ["e2", 2]] as const) {
      await store.saveEdition(edition(id, profile.id, n), `<html>${id}</html>`);
      await store.setFeedback({ id: `f-${id}`, profileId: profile.id, editionId: id, itemId: "i1", itemTitle: "A story", category: "paper", signal: 1, createdAt: at });
      await store.addInteraction({ id: `ix-${id}`, profileId: profile.id, editionId: id, itemId: "i1", category: "paper", kind: "open", createdAt: at });
    }

    const del = (id: string) => DELETE(new Request(`http://localhost/api/editions/${id}`, { method: "DELETE" }), { params: Promise.resolve({ id }) });

    session.user = null;
    expect((await del("e1")).status).toBe(401);

    // Another account gets the same answer as for an edition that does not exist.
    session.user = bob;
    expect((await del("e1")).status).toBe(404);
    expect(await store.getEdition("e1")).not.toBeNull();

    session.user = alice;
    expect((await del("e1")).status).toBe(200);
    expect(await store.getEdition("e1")).toBeNull();
    expect(await store.getStandaloneHtml("e1")).toBeNull();
    expect(await store.feedbackForEdition("e1")).toEqual([]);
    expect((await store.listEditions(profile.id, 10)).map((e) => e.id)).toEqual(["e2"]);

    // The other edition keeps everything.
    expect(await store.getStandaloneHtml("e2")).toContain("e2");
    expect(await store.feedbackForEdition("e2")).toHaveLength(1);
    expect((await store.listInteractions(profile.id, 10)).map((i) => i.editionId)).toEqual(["e2"]);

    // Deleting it again reports that it is gone.
    expect((await del("e1")).status).toBe(404);
  });
});
