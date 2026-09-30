import { describe, expect, it } from "vitest";
import { pregroup } from "../src/lib/pipeline/cluster";
import { mergeDuplicates, prescore, toCandidate } from "../src/lib/pipeline/collect";
import { planSearch } from "../src/lib/pipeline/plan";
import { normalizeProfile } from "../src/lib/pipeline/profile";
import { buildHistory, scoreCluster, selectTop } from "../src/lib/pipeline/rank";
import { CATEGORIES, defaultPreferences, type Candidate, type Cluster, type InterestProfile } from "../src/lib/types";
import { previousWeekWindow } from "../src/lib/util/dates";

const profile: InterestProfile = {
  summary: "s",
  person: { name: "Jane Doe" },
  topics: [{ name: "Lipidomics", weight: 1, keywords: ["lipidomics", "mass spectrometry"], zhKeywords: ["脂质组学"] }],
  entities: { people: [], organizations: [], companies: ["Northwind"], venues: [], products: [] },
  queries: [
    { category: "paper", query: "lipidomics", lang: "en" },
    { category: "wechat", query: "脂质组学", lang: "zh" },
    { category: "patent", query: "lipid isomer separation", lang: "en" },
  ],
  languages: ["en", "zh"],
  exclusions: ["olive oil"],
  scholar: { openalexAuthorId: "A1", confidence: "high", topWorkIds: ["W1", "W2"], coauthorIds: ["A2"] },
  updatedAt: "",
  version: 1,
};

function cand(p: Partial<Candidate> & { id: string; title: string }): Candidate {
  return {
    url: `https://${p.id}.example.com/a`,
    canonicalUrl: `https://${p.id}.example.com/a`,
    snippet: "",
    dateSource: "metadata",
    domain: `${p.id}.example.com`,
    provider: "test",
    ...p,
  };
}

describe("prescore", () => {
  it("rewards topic/entity matches and personal signals, penalizes exclusions", () => {
    const hit = prescore(cand({ id: "a", title: "New lipidomics method from Northwind" }), profile);
    const miss = prescore(cand({ id: "b", title: "Olive oil tasting notes" }), profile);
    const cites = prescore(cand({ id: "c", title: "Unrelated title", signals: ["cites-your-work"] }), profile);
    expect(hit).toBeGreaterThan(1);
    expect(miss).toBeLessThan(0);
    expect(cites).toBeGreaterThan(1);
    expect(prescore(cand({ id: "d", title: "脂质组学新进展" }), profile)).toBeGreaterThan(0.8);
  });
  it("uses word boundaries for Latin keywords", () => {
    const p = { ...profile, topics: [{ name: "AI", weight: 1, keywords: ["ai"] }] };
    expect(prescore(cand({ id: "e", title: "He said hello" }), p)).toBeLessThan(prescore(cand({ id: "f", title: "AI news" }), p));
  });
});

describe("normalization", () => {
  const w = previousWeekWindow(new Date());
  it("drops GitHub and out-of-window results", () => {
    const base = { title: "T", snippet: "", dateSource: "provider" as const, provider: "x", category: "news" as const, query: "q", taskKind: "news" as const };
    expect(toCandidate({ ...base, url: "https://github.com/a/b" }, w)).toBeNull();
    expect(toCandidate({ ...base, url: "https://a.example.com", publishedAt: "2020-01-01" }, w)).toBeNull();
    expect(toCandidate({ ...base, url: "https://a.example.com" }, w)?.dateSource).toBe("unknown");
  });
  it("merges duplicates by canonical URL and DOI", () => {
    const merged = mergeDuplicates([
      cand({ id: "a", title: "Paper", doi: "10.1/x", url: "https://doi.org/10.1/x", canonicalUrl: "https://doi.org/10.1/x", snippet: "short" }),
      cand({ id: "b", title: "Paper (arXiv)", doi: "10.1/x", url: "https://arxiv.org/abs/1", canonicalUrl: "https://arxiv.org/abs/1", content: "long content", signals: ["coauthor"] }),
      cand({ id: "c", title: "Other" }),
    ]);
    expect(merged).toHaveLength(2);
    expect(merged[0].content).toBe("long content");
    expect(merged[0].signals).toEqual(["coauthor"]);
    expect(merged[0].duplicates?.[0].url).toBe("https://arxiv.org/abs/1");
  });
  it("pre-groups near-duplicate headlines", () => {
    const groups = pregroup([
      cand({ id: "a", title: "Northwind opens spatial lipidomics core with 40 instruments" }),
      cand({ id: "b", title: "Northwind opens spatial lipidomics core" }),
      cand({ id: "c", title: "Completely different story about patents" }),
    ]);
    expect(groups).toEqual([["a", "b"], ["c"]]);
  });
});

describe("scoring and selection", () => {
  const k = (id: string, category: Cluster["category"], rel: number): Cluster => ({
    id,
    candidateIds: [id],
    category,
    label: id,
    scores: { relevance: rel, impact: 5, novelty: 5, credibility: 5, value: rel },
    rationale: "",
  });
  it("applies transparent adjustments", () => {
    const members = [cand({ id: "a", title: "A", snippet: "s", signals: ["cites-your-work"] }), cand({ id: "b", title: "B", snippet: "s" })];
    const s = scoreCluster({ ...k("x", "paper", 8), candidateIds: ["a", "b"] }, members, { urls: new Set(), titles: [] })!;
    expect(s.adjustments).toEqual(["+3 corroborated by 2 independent sources", "+6 cites your work"]);
    expect(s.total).toBeGreaterThan(70);
  });
  it("drops stories fully covered in earlier editions", () => {
    const members = [cand({ id: "a", title: "A" })];
    const history = buildHistory([
      { items: [{ title: "Old", sources: [{ url: members[0].url }] }] } as never,
    ]);
    expect(scoreCluster(k("a", "news", 8), members, history)).toBeNull();
  });
  it("caps categories and fills remaining slots", () => {
    const clusters = [
      ...Array.from({ length: 8 }, (_, i) => ({ ...k(`p${i}`, "paper", 9), total: 90 - i })),
      { ...k("n1", "news", 6), total: 50 },
      { ...k("j1", "job", 5), total: 40 },
    ];
    const { selected } = selectTop(clusters, 6, 4);
    expect(selected.map((c) => c.id)).toEqual(["p0", "p1", "p2", "p3", "n1", "j1"]);
    const { selected: filled } = selectTop(clusters, 10, 4);
    expect(filled).toHaveLength(10);
  });
});

describe("profile normalization and planning", () => {
  it("applies muted/pinned topics and backfills categories", () => {
    const out = {
      summary: "x",
      person: {},
      topics: [
        { name: "Lipidomics", weight: 0.8, keywords: ["lipidomics"] },
        { name: "Crypto", weight: 0.9, keywords: ["bitcoin"] },
      ],
      entities: {},
      queries: [
        { category: "paper", query: "lipidomics site:nature.com", lang: "en" },
        { category: "news", query: "bitcoin crypto price", lang: "en" },
      ],
      languages: [],
      exclusions: [],
    };
    const enabled = [...CATEGORIES];
    const p = normalizeProfile(out, { pinned: ["Ion mobility"], muted: ["crypto", "bitcoin"], enabled, inputHash: "h" });
    expect(p.topics.map((t) => t.name)).toEqual(["Ion mobility", "Lipidomics"]);
    expect(p.queries.find((q) => q.query.includes("site:"))).toBeUndefined();
    expect(p.queries.some((q) => q.query.includes("bitcoin"))).toBe(false);
    for (const c of enabled) expect(p.queries.some((q) => q.category === c)).toBe(true);
    expect(p.languages).toContain("zh");
    expect(p.exclusions).toContain("crypto");
  });
  it("plans provider-routed tasks with domain filters and personal OpenAlex tasks", () => {
    const tasks = planSearch(profile, defaultPreferences());
    expect(tasks.find((t) => t.category === "wechat")?.includeDomains).toEqual(["mp.weixin.qq.com"]);
    expect(tasks.find((t) => t.category === "patent")?.includeDomains).toContain("patents.google.com");
    expect(tasks.find((t) => t.signal === "cites-your-work")?.openalexFilter).toBe("cites:W1|W2");
    expect(tasks.find((t) => t.signal === "coauthor")?.openalexFilter).toBe("author.id:A2");
    expect(tasks.some((t) => t.kind === "arxiv")).toBe(true);
    expect(tasks.some((t) => t.query === '"Jane Doe"')).toBe(true);
  });
  it("respects disabled categories", () => {
    const prefs = defaultPreferences();
    prefs.categories.wechat = false;
    expect(planSearch(profile, prefs).some((t) => t.category === "wechat")).toBe(false);
  });
});
