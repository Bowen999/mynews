import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { resolveIdentity, withoutWeakMatchData } from "../src/lib/pipeline/identity";
import { describeHealth, runSearchTasks, type Routing } from "../src/lib/search";
import { resolveS2Author, s2Fetch } from "../src/lib/search/semanticscholar";
import {
  describeFailure,
  httpJson,
  isOutage,
  ProviderError,
  retryAfterMs,
  type RawResult,
  type SearchProvider,
  type SearchTask,
} from "../src/lib/search/types";

const ctx = { window: { start: new Date("2026-09-26T00:00:00Z"), end: new Date("2026-10-03T00:00:00Z") }, maxResults: 12 };
const none: Routing = { web: [], news: [], s2: [], europepmc: [], arxiv: [], scholar: [], feed: [] };
const task = (i: number, kind: SearchTask["kind"] = "s2"): SearchTask => ({ id: `t${i}`, kind, category: "paper", query: `query ${i}`, lang: "en", priority: 1 });
const tasks = (n: number, kind: SearchTask["kind"] = "s2") => Array.from({ length: n }, (_, i) => task(i, kind));
const hit = (name: string): RawResult => ({ url: `https://example.org/${name}`, title: name, snippet: "", dateSource: "metadata", provider: name });

/** A provider that answers (or fails) as `plan(callNumber)` says. */
function provider(name: string, plan: (call: number) => "ok" | Error): SearchProvider & { calls: number } {
  const p = {
    name,
    calls: 0,
    async search(): Promise<RawResult[]> {
      const outcome = plan(p.calls++);
      if (outcome instanceof Error) throw outcome;
      return [hit(name)];
    },
  };
  return p;
}
const rateLimited = (name: string) => new ProviderError(name, "HTTP 429", false, 429);
const run = (routing: Routing, list: SearchTask[]) => runSearchTasks(list, ctx, { deadlineMs: 60_000, routing });

describe("a provider that keeps failing is switched off for the run", () => {
  it("stops sending requests to a rate-limited service after two in a row", async () => {
    const s2 = provider("semantic-scholar", () => rateLimited("semantic-scholar"));
    const out = await run({ ...none, s2: [s2] }, tasks(6));
    expect(s2.calls).toBe(2);
    expect(out.providersUsed).toEqual([]);
    expect(out.health).toEqual([{ provider: "semantic-scholar", ok: 0, failed: 2, skipped: 4, reason: "was rate-limited (HTTP 429)" }]);
    expect(describeHealth(out.health[0])).toBe("Semantic Scholar was rate-limited (HTTP 429): 2 requests failed, 4 skipped.");
  });

  it("counts a timeout as an outage", async () => {
    const arxiv = provider("arxiv", () => new ProviderError("arxiv", "The operation was aborted due to timeout", false, undefined, { timedOut: true }));
    const out = await run({ ...none, arxiv: [arxiv] }, tasks(5, "arxiv"));
    expect(arxiv.calls).toBe(2);
    expect(describeHealth(out.health[0])).toBe("arXiv timed out: 2 requests failed, 3 skipped.");
  });

  it("keeps going when answers come in between", async () => {
    const s2 = provider("semantic-scholar", (n) => (n % 2 === 0 ? rateLimited("semantic-scholar") : "ok"));
    const out = await run({ ...none, s2: [s2] }, tasks(6));
    expect(s2.calls).toBe(6);
    expect(out.results).toHaveLength(3);
    expect(out.health).toEqual([{ provider: "semantic-scholar", ok: 3, failed: 3, skipped: 0, reason: "was rate-limited (HTTP 429)" }]);
  });

  it("does not switch off a provider over requests that were wrong rather than refused", async () => {
    const epmc = provider("europe-pmc", () => new ProviderError("europe-pmc", "HTTP 400 bad query", false, 400));
    const out = await run({ ...none, europepmc: [epmc] }, tasks(5, "europepmc"));
    expect(epmc.calls).toBe(5);
    expect(out.health).toEqual([{ provider: "europe-pmc", ok: 0, failed: 5, skipped: 0, reason: "answered HTTP 400" }]);
  });

  it("switches off at once for a bad key or an exhausted quota", async () => {
    const scholar = provider("google-scholar", () => new ProviderError("google-scholar", "HTTP 403", true, 403));
    const out = await run({ ...none, scholar: [scholar] }, tasks(4, "scholar"));
    expect(scholar.calls).toBe(1);
    expect(out.health[0]).toMatchObject({ failed: 1, skipped: 3 });
  });

  it("lets the next provider in line take over, without reporting the first as skipped", async () => {
    const first = provider("semantic-scholar", () => rateLimited("semantic-scholar"));
    const second = provider("mirror", () => "ok");
    const out = await run({ ...none, s2: [first, second] }, tasks(5));
    expect(first.calls).toBe(2);
    expect(second.calls).toBe(5);
    expect(out.results).toHaveLength(5);
    expect(out.providersUsed).toEqual(["mirror"]);
    expect(out.health).toEqual([{ provider: "semantic-scholar", ok: 0, failed: 2, skipped: 0, reason: "was rate-limited (HTTP 429)" }]);
  });

  it("reports nothing when everything works", async () => {
    const out = await run({ ...none, s2: [provider("semantic-scholar", () => "ok")] }, tasks(3));
    expect(out.health).toEqual([]);
    expect(out.errors).toEqual([]);
  });
});

describe("failure helpers", () => {
  it("describes failures in a few words", () => {
    expect(describeFailure(new ProviderError("x", "HTTP 429", false, 429))).toBe("was rate-limited (HTTP 429)");
    expect(describeFailure(new ProviderError("x", "HTTP 503", false, 503))).toBe("was unavailable (HTTP 503)");
    expect(describeFailure(new ProviderError("x", "HTTP 404", false, 404))).toBe("answered HTTP 404");
    expect(describeFailure(new ProviderError("x", "slow", false, undefined, { timedOut: true }))).toBe("timed out");
    expect(describeFailure(new ProviderError("arxiv", "fetch failed"))).toBe("failed (fetch failed)");
    expect(describeFailure(new TypeError("x".repeat(200)))).toMatch(/^failed \(x{79}…\)$/);
  });

  it("tells outages from bad requests", () => {
    expect(isOutage(new ProviderError("x", "", false, 429))).toBe(true);
    expect(isOutage(new ProviderError("x", "", false, 502))).toBe(true);
    expect(isOutage(new ProviderError("x", "", false, undefined, { timedOut: true }))).toBe(true);
    expect(isOutage(new ProviderError("x", "", false, 400))).toBe(false);
    expect(isOutage(new ProviderError("x", "", false, 404))).toBe(false);
  });

  it("reads Retry-After as seconds or a date", () => {
    expect(retryAfterMs({ headers: new Headers({ "retry-after": "3" }) })).toBe(3000);
    expect(retryAfterMs({ headers: new Headers() })).toBeUndefined();
    expect(retryAfterMs({ headers: new Headers({ "retry-after": "soon" }) })).toBeUndefined();
    const inTenSeconds = new Date(Date.now() + 10_000).toUTCString();
    const ms = retryAfterMs({ headers: new Headers({ "retry-after": inTenSeconds }) })!;
    expect(ms).toBeGreaterThan(8000);
    expect(ms).toBeLessThanOrEqual(10_000);
  });
});

describe("httpJson", () => {
  let server: http.Server;
  let base = "";
  beforeAll(async () => {
    server = http.createServer((req, res) => {
      if (req.url === "/slow") return; // never answers
      if (req.url === "/busy") {
        res.writeHead(429, { "Retry-After": "3", "Content-Type": "application/json" });
        return void res.end(JSON.stringify({ message: "Too Many Requests. Please wait and try again or apply for a key.", code: "429" }));
      }
      res.writeHead(500, { "Content-Type": "text/plain" });
      res.end("upstream exploded");
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => {
    server.closeAllConnections();
    server.close();
  });

  it("keeps what a 429 says to wait and leaves out its boilerplate body", async () => {
    const err = await httpJson("semantic-scholar", `${base}/busy`).catch((e) => e);
    expect(err).toBeInstanceOf(ProviderError);
    expect(err).toMatchObject({ status: 429, retryAfterMs: 3000, fatal: false, message: "semantic-scholar: HTTP 429" });
  });

  it("keeps the start of other error bodies", async () => {
    const err = await httpJson("x", `${base}/other`).catch((e) => e);
    expect(err).toMatchObject({ status: 500, message: "x: HTTP 500 upstream exploded" });
  });

  it("marks a request that ran out of time", async () => {
    const err = (await httpJson("arxiv", `${base}/slow`, { timeoutMs: 80 }).catch((e: unknown) => e)) as ProviderError;
    expect(err).toBeInstanceOf(ProviderError);
    expect(err.timedOut).toBe(true);
    expect(err.status).toBeUndefined();
    expect(describeFailure(err)).toBe("timed out");
  });
});

describe("Semantic Scholar", () => {
  const json = (body: unknown, init: ResponseInit = {}) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" }, ...init });
  const busy = (retryAfter?: string) => new Response("{}", { status: 429, headers: retryAfter ? { "retry-after": retryAfter } : {} });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    delete process.env.MOCK_MODE;
  });

  it("retries a 429 once, after a couple of seconds", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout"] });
    const fetchMock = vi.fn().mockResolvedValueOnce(busy()).mockResolvedValueOnce(json({ data: [] }));
    vi.stubGlobal("fetch", fetchMock);
    const pending = s2Fetch<{ data: unknown[] }>("https://api.semanticscholar.org/graph/v1/paper/search?query=x");
    await vi.advanceTimersByTimeAsync(3000);
    expect(await pending).toEqual({ data: [] });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("gives up after the one retry", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout"] });
    const fetchMock = vi.fn().mockImplementation(async () => busy());
    vi.stubGlobal("fetch", fetchMock);
    const pending = s2Fetch("https://api.semanticscholar.org/graph/v1/paper/search?query=x").catch((e) => e);
    await vi.advanceTimersByTimeAsync(3000);
    expect(await pending).toMatchObject({ status: 429 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not wait for a long Retry-After", async () => {
    const fetchMock = vi.fn().mockResolvedValue(busy("60"));
    vi.stubGlobal("fetch", fetchMock);
    await expect(s2Fetch("https://api.semanticscholar.org/graph/v1/paper/search?query=x")).rejects.toMatchObject({ status: 429, retryAfterMs: 60_000 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  const authors = [
    { authorId: "1", name: "Bo-Wen Yang", paperCount: 18 },
    { authorId: "2", name: "Bowen Yang", paperCount: 15 },
  ];

  it("names a weak author match without loading their papers", async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes("/author/search")) return json({ data: authors });
      throw new Error(`unexpected request ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const r = await resolveS2Author({ name: "Bowen Yang", affiliations: ["University of Alberta"] });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(r).toMatchObject({ s2AuthorId: "1", displayName: "Bo-Wen Yang", confidence: "low", paperIds: [], paperTitles: [], coauthorIds: [], coauthorNames: [] });
    expect(r.note).toMatch(/Several Semantic Scholar authors are named "Bowen Yang"/);
  });

  it("loads the papers of a match backed by the affiliation", async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes("/author/search")) {
        return json({ data: [{ authorId: "9", name: "Bowen Yang", affiliations: ["University of Alberta"], paperCount: 30 }, authors[1]] });
      }
      if (url.includes("/author/9/papers")) {
        return json({ data: [{ paperId: "p1", title: "A real paper", year: 2025, citationCount: 4, authors: [{ authorId: "9", name: "Bowen Yang" }, { authorId: "7", name: "Ada" }] }] });
      }
      throw new Error(`unexpected request ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const r = await resolveS2Author({ name: "Bowen Yang", affiliations: ["University of Alberta"] });
    expect(r).toMatchObject({ s2AuthorId: "9", confidence: "medium", paperIds: ["p1"], paperTitles: ["A real paper"] });
  });

  it("takes 'your work' from the person's own pages when the author match is weak", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout"] });
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes("/paper/search/match")) return json({ data: [] });
      if (url.includes("/author/search")) return json({ data: authors });
      throw new Error(`unexpected request ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const pending = resolveIdentity({
      name: "Bowen Yang",
      affiliations: [],
      hints: [{ paperTitles: ["Lipid droplets in my own lab"] }],
      deadlineAt: Date.now() + 120_000,
    });
    await vi.runAllTimersAsync();
    const identity = await pending;
    expect(identity).toMatchObject({ s2AuthorId: "1", confidence: "low", paperIds: [], paperTitles: ["Lipid droplets in my own lab"] });
  });
});

describe("a weak author match stored by an earlier version", () => {
  const stored = {
    s2AuthorId: "1",
    displayName: "Bo-Wen Yang",
    confidence: "low" as const,
    paperIds: ["p1", "p2"],
    paperTitles: ["Someone else's paper"],
    coauthorIds: ["c1"],
    coauthorNames: ["Ada"],
    citesIds: ["1001"],
    scholarUserId: "gs1",
    note: "Several authors share this name.",
    resolvedAt: "2026-10-01T00:00:00.000Z",
  };

  it("loses the papers and co-authors that may not be the person's, and keeps the rest", () => {
    const fixed = withoutWeakMatchData(stored, ["My own paper"])!;
    expect(fixed).toMatchObject({ s2AuthorId: "1", confidence: "low", paperIds: [], coauthorIds: [], coauthorNames: [], paperTitles: ["My own paper"] });
    expect(fixed).toMatchObject({ citesIds: ["1001"], scholarUserId: "gs1", note: stored.note, resolvedAt: stored.resolvedAt });
  });

  it("leaves a trusted match, a missing match and an already clean weak match alone", () => {
    const trusted = { ...stored, confidence: "medium" as const };
    expect(withoutWeakMatchData(trusted, ["x"])).toBe(trusted);
    expect(withoutWeakMatchData(undefined, ["x"])).toBeUndefined();
    const clean = { ...stored, paperIds: [], coauthorIds: [], coauthorNames: [], paperTitles: ["Mine"] };
    expect(withoutWeakMatchData(clean, ["Other"])).toBe(clean);
  });
});
