import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// End-to-end run of all eight stages in MOCK_MODE (fictional corpus, mock LLM, file store).
const dir = mkdtempSync(path.join(os.tmpdir(), "mynews-e2e-"));

beforeAll(() => {
  process.env.MOCK_MODE = "1";
  process.env.NTFY_DISABLED = "1";
  process.env.DATA_DIR = dir;
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

async function drive(runId: string) {
  const { advanceRun } = await import("../src/lib/pipeline/runner");
  for (let i = 0; i < 30; i++) {
    const { run } = await advanceRun(runId);
    if (run.status !== "running") return run;
  }
  throw new Error("run did not finish");
}

describe("pipeline (mock mode)", () => {
  it("asks for input when no sources are configured", async () => {
    const { startRun } = await import("../src/lib/pipeline/runner");
    const res = await startRun({});
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.problems.map((p) => p.key)).toEqual(["SOURCES"]);
  });

  it("generates a verified, clustered, ranked edition", async () => {
    const { getStore, loadProfile } = await import("../src/lib/store");
    const { startRun } = await import("../src/lib/pipeline/runner");
    const store = getStore();
    const profile = await loadProfile(store);
    profile.sources = [{ id: "s1", url: "https://lab.example.edu/chen", addedAt: new Date().toISOString() }];
    await store.saveProfile(profile);

    const res = await startRun({ baseUrl: "http://localhost:3000" });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const run = await drive(res.run.id);
    expect(run.error).toBeUndefined();
    expect(run.status).toBe("completed");
    expect(run.progress.every((p) => p.status === "done")).toBe(true);

    const edition = (await store.getEdition(run.editionId!))!;
    expect(edition.number).toBe(1);
    expect(edition.sample).toBe(true);
    expect(edition.items.length).toBeGreaterThanOrEqual(8);
    expect(edition.items.length).toBeLessThanOrEqual(10);
    expect(edition.items.map((i) => i.rank)).toEqual(edition.items.map((_, i) => i + 1));

    // Irrelevant content should not make the cut.
    expect(edition.items.some((i) => /olive oil/i.test(i.title))).toBe(false);
    // Two outlets covering the same story are aggregated into one item.
    const northwind = edition.items.find((i) => /Northwind/.test(i.title))!;
    expect(northwind.sources.length).toBe(2);
    expect(new Set(northwind.sources.map((s) => s.domain)).size).toBe(2);

    for (const item of edition.items) {
      const ids = new Set(item.sources.map((s) => s.id));
      expect(item.sources.length).toBeGreaterThan(0);
      expect(item.summary).toMatch(/\[S\d+\]/);
      for (const m of item.summary.matchAll(/\[(S\d+)\]/g)) expect(ids.has(m[1])).toBe(true);
      for (const f of item.keyFacts) for (const s of f.sources) expect(ids.has(s)).toBe(true);
      for (const s of item.sources) expect(s.url).toMatch(/^https:\/\/[a-z.]*example\.(com|org|net|edu|gov|cn)\//);
      expect(item.relevance.total).toBeGreaterThan(0);
    }
    // Personal signal (cites your work) is surfaced in the ranking explanation.
    const cites = edition.items.find((i) => i.relevance.adjustments.some((a) => a.includes("cites your work")));
    expect(cites?.rank).toBe(1);

    const html = await store.getStandaloneHtml(edition.id);
    expect(html).toContain("<!doctype html>");
    expect(html).toContain(edition.items[0].title.replace(/&/g, "&amp;"));

    // Profile was built and persisted.
    const saved = await loadProfile(store);
    expect(saved.interest?.topics.length).toBeGreaterThan(0);
  });

  it("does not repeat stories already covered in the previous edition", async () => {
    const { getStore } = await import("../src/lib/store");
    const { startRun } = await import("../src/lib/pipeline/runner");
    const store = getStore();
    const [first] = await store.recentEditions("default", 1);
    const seen = new Set(first.items.flatMap((i) => i.sources.map((s) => s.url)));
    const res = await startRun({});
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const run = await drive(res.run.id);
    if (run.status === "completed") {
      const second = (await store.getEdition(run.editionId!))!;
      expect(second.number).toBe(2);
      expect(second.items.length).toBeLessThan(first.items.length);
      for (const item of second.items) for (const s of item.sources) expect(seen.has(s.url)).toBe(false);
    } else {
      expect(run.error).toMatch(/No relevant stories/);
    }
  });
});
