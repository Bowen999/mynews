import http from "node:http";
import type { AddressInfo } from "node:net";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cosine, decodeVector, encodeVector, normalize } from "../src/lib/embed";
import { JinaEmbedder } from "../src/lib/embed/jina";
import { MockEmbedder } from "../src/lib/embed/mock";
import { pregroup } from "../src/lib/pipeline/cluster";
import { prescore } from "../src/lib/pipeline/collect";
import { scoreCluster, selectTop } from "../src/lib/pipeline/rank";
import { affinityAdjustment, candidateText, ensurePrototypes, loadFeedbackContext, scoreSemantics, type FeedbackContext } from "../src/lib/pipeline/semantic";
import { FileStore } from "../src/lib/store/file";
import { defaultPreferences, type BriefingItem, type Candidate, type Cluster, type Edition, type InterestProfile } from "../src/lib/types";

const embedder = new MockEmbedder();
const noFeedback: FeedbackContext = { positive: [], negative: [], likedPaperIds: [], dislikedPaperIds: [], affinity: {}, opened: 0 };

function cand(p: Partial<Candidate> & { id: string; title: string }): Candidate {
  return { url: `https://${p.id}.example.com/a`, canonicalUrl: `https://${p.id}.example.com/a`, snippet: "", dateSource: "metadata", domain: `${p.id}.example.com`, provider: "test", ...p };
}

const profile = (): InterestProfile => ({
  summary: "s",
  person: { name: "Jane Doe" },
  topics: [
    { name: "Single-cell lipidomics", weight: 1, keywords: ["single cell lipid profiling", "lipidome of single cells"] },
    { name: "Ion mobility", weight: 0.8, keywords: ["trapped ion mobility separation"] },
  ],
  entities: { people: [], organizations: [], companies: [], venues: [], products: [] },
  queries: [],
  languages: ["en"],
  exclusions: [],
  scholar: { paperTitles: ["Deep learning annotation of lipid spectra"] },
  updatedAt: "",
  version: 1,
});

describe("vectors", () => {
  it("round-trips int8 base64 encoding with tiny error", async () => {
    const [v] = await embedder.embed(["single cell lipidomics with ion mobility"]);
    const back = decodeVector(encodeVector(v))!;
    expect(back.length).toBe(256);
    expect(cosine(v, back)).toBeGreaterThan(0.99);
    expect(encodeVector(v).length).toBeLessThan(400);
    expect(decodeVector(undefined)).toBeNull();
  });
  it("mock embeddings reflect shared vocabulary", async () => {
    const [a, b, c] = await embedder.embed([
      "Trapped ion mobility enables lipidome maps of single hepatocytes",
      "Single hepatocytes lipidome maps with trapped ion mobility",
      "Celebrity chef shares favorite olive oil brands",
    ]);
    expect(cosine(a, b)).toBeGreaterThan(0.5);
    expect(cosine(a, c)).toBeLessThan(0.2);
    expect(cosine(normalize(a), a)).toBeCloseTo(1, 5);
  });
});

describe("Jina embeddings client", () => {
  let server: http.Server;
  let base = "";
  let body: Record<string, unknown> = {};
  let auth = "";
  beforeAll(async () => {
    server = http.createServer((req, res) => {
      let raw = "";
      req.on("data", (c) => (raw += c));
      req.on("end", () => {
        body = JSON.parse(raw);
        auth = String(req.headers.authorization);
        const input = body.input as string[];
        // Reply out of order to check that vectors are re-sorted by index.
        const data = input.map((_, i) => ({ index: i, embedding: [i + 1, 0, 0, 0] })).reverse();
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ data, usage: { total_tokens: 12 } }));
      });
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => server.close());

  it("requests text-matching embeddings at the configured size and returns unit vectors in order", async () => {
    const jina = new JinaEmbedder({ apiKey: "jina_test", model: "jina-embeddings-v3", dims: 256, baseUrl: base });
    const out = await jina.embed(["first", "second"]);
    expect(auth).toBe("Bearer jina_test");
    expect(body).toMatchObject({ model: "jina-embeddings-v3", task: "text-matching", dimensions: 256, normalized: true, input: ["first", "second"] });
    expect(out.map((v) => v[0])).toEqual([1, 1]);
    expect(jina.tokens).toBe(12);
    expect(jina.model).toBe("jina-embeddings-v3@256");
  });
});

describe("semantic scoring", () => {
  it("embeds prototypes once and scores candidates by meaning", async () => {
    const interest = profile();
    const prefs = { ...defaultPreferences(), mutedTopics: ["olive oil brands"] };
    expect(await ensurePrototypes(interest, prefs, embedder)).toBe(true);
    expect(await ensurePrototypes(interest, prefs, embedder)).toBe(false); // cached
    expect(interest.prototypes?.items.map((p) => p.kind)).toEqual(["topic", "topic", "work", "negative"]);

    const good = cand({ id: "a", title: "Lipidome of single cells measured by profiling hepatocytes" });
    const own = cand({ id: "b", title: "Deep learning annotation of lipid spectra improves accuracy" });
    const bad = cand({ id: "c", title: "Chef ranks olive oil brands" });
    expect(await scoreSemantics([good, own, bad], interest, noFeedback, embedder)).toBe(true);
    expect(good.semantic!).toBeGreaterThan(bad.semantic!);
    expect(good.matched).toBe("your topic “Single-cell lipidomics”");
    expect(own.matched).toBe("your paper “Deep learning annotation of lipid spectra”");
    expect(bad.semantic).toBeLessThan(0.2);
    // The semantic match lifts the pre-score.
    expect(prescore(good, interest)).toBeGreaterThan(prescore({ ...good, semantic: undefined }, interest));
  });

  it("learns from liked stories", async () => {
    const interest = profile();
    await ensurePrototypes(interest, defaultPreferences(), embedder);
    const [liked] = await embedder.embed(["Northwind opens spatial imaging core for neuroscience"]);
    const fb: FeedbackContext = { ...noFeedback, positive: [{ v: liked, weight: 1, label: "a story you liked (“Northwind core”)" }] };
    const c = cand({ id: "n", title: "Northwind spatial imaging core opens to neuroscience labs" });
    await scoreSemantics([c], interest, fb, embedder);
    expect(c.matched).toBe("a story you liked (“Northwind core”)");
    expect(c.semantic).toBeGreaterThan(0.5);
  });

  it("groups same-story candidates by embedding similarity", async () => {
    const a = cand({ id: "a", title: "Northwind opens imaging core", snippet: "Northwind Biosciences opens a lipid imaging core with 40 instruments for neuroscience labs." });
    const b = cand({ id: "b", title: "New facility for brain research", snippet: "Northwind Biosciences opens a lipid imaging core with 40 instruments, prioritizing neuroscience labs." });
    const c = cand({ id: "c", title: "Patent filed on drift gas modifiers", snippet: "An application covers drift gas modifiers for ion mobility." });
    const vectors = await embedder.embed([a, b, c].map(candidateText));
    [a, b, c].forEach((x, i) => (x.embedding = encodeVector(vectors[i])));
    expect(pregroup([a, b, c])).toHaveLength(3); // headlines alone look unrelated
    expect(pregroup([a, b, c], 0.55, embedder.calibration.sameStory)).toEqual([["a", "b"], ["c"]]);
  });
});

describe("ranking with embeddings, watchlist and affinity", () => {
  const k = (id: string, rel: number, total: number, embedding?: string): Cluster => ({
    id,
    candidateIds: [id],
    category: "paper",
    label: id,
    scores: { relevance: rel, impact: 5, novelty: 5, credibility: 5, value: rel },
    rationale: "",
    total,
    embedding,
  });

  it("blends the semantic match into relevance and explains watchlist and affinity adjustments", () => {
    const m = cand({ id: "a", title: "A", snippet: "s", semantic: 0.9, matched: "your topic “X”", watch: ["Northwind"] });
    const s = scoreCluster(k("a", 6, 0), [m], { urls: new Set(), titles: [], vectors: [] }, { affinity: { paper: 0.5 } })!;
    expect(s.scores.relevance).toBe(6.8); // 0.75 × 6 + 0.25 × 9
    expect(s.adjustments).toEqual(["Closest to your topic “X” (match 0.90)", "+5 on your watchlist: Northwind", "+4 you often read Research"]);
    expect(affinityAdjustment("job", { job: -0.4 })).toEqual({ points: -3, note: "-3 you rarely read Jobs & Recruiting" });
  });

  it("penalizes stories that repeat an earlier edition by meaning", async () => {
    const [v, w] = await embedder.embed(["lipid imaging core opens at Northwind", "lipid imaging core opens at Northwind today"]);
    const m = cand({ id: "a", title: "Brand new headline", snippet: "s", embedding: encodeVector(v) });
    const s = scoreCluster(k("a", 7, 0), [m], { urls: new Set(), titles: [], vectors: [w] }, { sameStory: embedder.calibration.sameStory })!;
    expect(s.adjustments).toContain("−10 similar story in an earlier edition");
  });

  it("diversifies the top list (MMR) when stories overlap", async () => {
    const [x, y, z] = await embedder.embed([
      "single cell lipidomics ion mobility hepatocytes",
      "single cell lipidomics ion mobility hepatocytes atlas",
      "postdoc position mass spectrometry",
    ]);
    const clusters = [k("x", 8, 80, encodeVector(x)), k("y", 8, 79, encodeVector(y)), k("z", 8, 70, encodeVector(z))];
    const plain = selectTop(clusters, 2, 4);
    expect(plain.selected.map((c) => c.id)).toEqual(["x", "y"]);
    const diverse = selectTop(clusters, 2, 4, { from: (embedder.calibration.ceil + embedder.calibration.sameStory) / 2 });
    expect(diverse.selected.map((c) => c.id)).toEqual(["x", "z"]);
    const third = selectTop(clusters, 3, 4, { from: 0.5 }).selected.find((c) => c.id === "y")!;
    expect(third.adjustments?.at(-1)).toMatch(/^−\d+ overlaps with “x”/);
  });
});

describe("feedback context", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "mynews-semantic-"));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it("turns likes, opens and skipped stories into vectors, seeds and category affinity", async () => {
    const store = new FileStore(dir);
    const [v1, v2] = await embedder.embed(["liked story", "read story"]);
    const item = (id: string, category: BriefingItem["category"], embedding?: string, paperId?: string): BriefingItem =>
      ({ id, rank: 1, category, title: id, sources: [{ id: "S1", url: `https://${id}.example.com`, title: id, domain: "x", dateSource: "metadata", provider: "t", paperId }], embedding }) as BriefingItem;
    const edition = {
      id: "e1",
      profileId: "p",
      createdAt: new Date().toISOString(),
      items: [item("i1", "paper", encodeVector(v1), "s2-liked"), item("i2", "news", encodeVector(v2)), item("i3", "job"), item("i4", "job")],
    } as Edition;
    const now = new Date().toISOString();
    await store.setFeedback({ id: "f1", profileId: "p", editionId: "e1", itemId: "i1", itemTitle: "i1", category: "paper", signal: 1, createdAt: now });
    await store.addInteraction({ id: "x1", profileId: "p", editionId: "e1", itemId: "i2", category: "news", kind: "open", createdAt: now });
    await store.addInteraction({ id: "x1", profileId: "p", editionId: "e1", itemId: "i2", category: "news", kind: "open", createdAt: now }); // duplicate ignored
    const ctx = await loadFeedbackContext(store, "p", [edition]);
    expect(ctx.likedPaperIds).toEqual(["s2-liked"]);
    expect(ctx.positive.map((p) => p.label)).toEqual(["a story you liked (“i1”)", "a story you read (“i2”)"]);
    expect(ctx.opened).toBe(1);
    expect(ctx.affinity.paper).toBeGreaterThan(0);
    expect(ctx.affinity.news).toBeGreaterThan(0);
    expect(ctx.affinity.job).toBeLessThan(0);
    expect((await store.listInteractions("p", 10)).length).toBe(1);
  });
});
