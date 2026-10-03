import { describe, expect, it } from "vitest";
import { themeInitScript } from "../src/components/ThemeToggle";
import { renderStandalone } from "../src/lib/render/standalone";
import type { Edition } from "../src/lib/types";

/** Runs the inline script against a fake page and storage; returns the data-theme it set. */
function applied(stored: string | null | "storage-throws"): string | undefined {
  const root = { dataset: {} as Record<string, string | undefined> };
  const storage = {
    getItem: () => {
      if (stored === "storage-throws") throw new Error("denied");
      return stored;
    },
  };
  new Function("localStorage", "document", themeInitScript)(storage, { documentElement: root });
  return root.dataset.theme;
}

describe("the default theme is dark", () => {
  it("leaves the page dark (no data-theme) for a first visit, whatever the device prefers", () => {
    expect(applied(null)).toBeUndefined();
  });

  it("applies a saved choice before first paint", () => {
    expect(applied("light")).toBe("light");
    expect(applied("dark")).toBe("dark");
  });

  it("ignores anything else that is stored, and a blocked storage", () => {
    expect(applied("system")).toBeUndefined();
    expect(applied("")).toBeUndefined();
    expect(applied("storage-throws")).toBeUndefined();
  });
});

describe("the standalone export", () => {
  const edition = {
    id: "e1",
    profileId: "p",
    runId: "r",
    number: 3,
    headline: "A headline",
    dek: "One sentence.",
    themes: [],
    windowStart: "2026-09-26T00:00:00Z",
    windowEnd: "2026-10-03T00:00:00Z",
    createdAt: "2026-10-03T00:00:00Z",
    items: [],
    alsoNoted: [],
    stats: { queries: 0, providers: [], candidates: 0, inWindow: 0, clusters: 0, durationMs: 0, removedClaims: 0 },
    profileSummary: "",
    model: { provider: "mock", model: "mock" },
  } as Edition;

  it("opens dark and lets the reader switch to light", () => {
    const html = renderStandalone(edition);
    expect(html).toContain(":root{--bg:#0f0f0f;");
    expect(html).toContain(":root[data-theme=light]{--bg:#fff;");
    expect(html).toContain('<meta name="color-scheme" content="dark light">');
    expect(html).not.toContain("prefers-color-scheme");
  });

  it("prints on light colors", () => {
    expect(renderStandalone(edition)).toMatch(/@media print\{:root,:root\[data-theme=light\]\{--bg:#fff;/);
  });
});
