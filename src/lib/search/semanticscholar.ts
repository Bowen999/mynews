import { config } from "../config";
import { isoDay } from "../util/dates";
import { truncate } from "../util/text";
import { httpJson, ProviderError, type RawResult, type SearchContext, type SearchProvider, type SearchTask } from "./types";

const GRAPH = "https://api.semanticscholar.org/graph/v1";
const RECS = "https://api.semanticscholar.org/recommendations/v1";
const NAME = "semantic-scholar";

export const S2_PAPER_FIELDS = "paperId,title,abstract,url,venue,publicationDate,authors,externalIds,journal";

export interface S2Paper {
  paperId?: string;
  title?: string | null;
  abstract?: string | null;
  url?: string | null;
  venue?: string | null;
  publicationDate?: string | null;
  year?: number | null;
  citationCount?: number | null;
  authors?: { authorId?: string | null; name?: string | null }[];
  externalIds?: { DOI?: string; ArXiv?: string; PubMed?: string; [k: string]: unknown } | null;
  journal?: { name?: string | null } | null;
}

interface S2Author {
  authorId: string;
  name?: string;
  affiliations?: string[];
  paperCount?: number;
  citationCount?: number;
}

function headers(): Record<string, string> {
  const h: Record<string, string> = { Accept: "application/json" };
  if (config.search.semanticScholarKey) h["x-api-key"] = config.search.semanticScholarKey;
  return h;
}

/** Longest we will wait to retry after a 429; a service that asks for more is not worth waiting for. */
const RETRY_WAIT_CAP_MS = 8000;

/**
 * GET/POST with one retry on 429 (the keyless pool is shared and often busy), after what the service
 * asked for (Retry-After) or 2 s, plus a little jitter. A longer Retry-After is passed on at once.
 */
export async function s2Fetch<T>(url: string, init: RequestInit = {}): Promise<T> {
  const req = () => httpJson<T>(NAME, url, { ...init, headers: { ...headers(), ...(init.headers ?? {}) }, timeoutMs: 20000 });
  try {
    return await req();
  } catch (e) {
    if (e instanceof ProviderError && e.status === 429) {
      const wait = Math.max(2000, e.retryAfterMs ?? 0);
      if (wait > RETRY_WAIT_CAP_MS) throw e;
      await new Promise((r) => setTimeout(r, wait + Math.random() * 500));
      return req();
    }
    throw e;
  }
}

/** Prefer a DOI / arXiv / PubMed link over the Semantic Scholar page. */
export function paperUrl(p: S2Paper): string | undefined {
  const ids = p.externalIds ?? {};
  if (ids.DOI) return `https://doi.org/${String(ids.DOI).toLowerCase()}`;
  if (ids.ArXiv) return `https://arxiv.org/abs/${ids.ArXiv}`;
  if (ids.PubMed) return `https://pubmed.ncbi.nlm.nih.gov/${ids.PubMed}/`;
  return p.url ?? (p.paperId ? `https://www.semanticscholar.org/paper/${p.paperId}` : undefined);
}

/** Normalize a Semantic Scholar paper. Papers without an exact publication date are dropped (the window can't be checked). */
export function normalizeS2Paper(p: S2Paper, signal?: string): RawResult | null {
  const url = paperUrl(p);
  if (!p.title || !url || !p.publicationDate) return null;
  const abstract = (p.abstract ?? "").replace(/\s+/g, " ").trim();
  const venue = p.venue || p.journal?.name || undefined;
  return {
    url,
    title: p.title.replace(/\s+/g, " ").trim(),
    snippet: truncate(abstract, 600),
    content: abstract || undefined,
    publishedAt: p.publicationDate,
    dateSource: "metadata",
    publisher: venue ?? (p.externalIds?.ArXiv ? "arXiv" : "Semantic Scholar"),
    venue,
    doi: p.externalIds?.DOI ? String(p.externalIds.DOI).toLowerCase() : undefined,
    authors: (p.authors ?? []).map((a) => a.name).filter((n): n is string => Boolean(n)).slice(0, 12),
    paperId: p.paperId,
    signals: signal ? [signal] : undefined,
    provider: NAME,
  };
}

/** Semantic Scholar: keyword search, author feeds, citations of your papers and paper recommendations. */
export class SemanticScholarProvider implements SearchProvider {
  readonly name = NAME;
  /** 1 request/second on the default key tier. */
  readonly minIntervalMs = 1100;

  async search(task: SearchTask, ctx: SearchContext): Promise<RawResult[]> {
    const req = task.s2 ?? { mode: "search" };
    const fields = S2_PAPER_FIELDS;
    let papers: S2Paper[] = [];
    switch (req.mode) {
      case "search": {
        const params = new URLSearchParams({
          query: task.query.replace(/[-+|"]/g, " ").replace(/\s+/g, " ").trim(),
          publicationDateOrYear: `${isoDay(ctx.window.start)}:${isoDay(ctx.window.end)}`,
          fields,
          limit: String(Math.min(ctx.maxResults * 2, 25)),
        });
        papers = (await s2Fetch<{ data?: S2Paper[] }>(`${GRAPH}/paper/search?${params}`)).data ?? [];
        break;
      }
      case "author": {
        const params = new URLSearchParams({ fields, limit: "100" });
        papers = (await s2Fetch<{ data?: S2Paper[] }>(`${GRAPH}/author/${encodeURIComponent(req.authorId)}/papers?${params}`)).data ?? [];
        break;
      }
      case "citations": {
        const params = new URLSearchParams({ fields, limit: "200" });
        const data = await s2Fetch<{ data?: { citingPaper?: S2Paper }[] }>(
          `${GRAPH}/paper/${encodeURIComponent(req.paperId)}/citations?${params}`,
        );
        papers = (data.data ?? []).map((d) => d.citingPaper).filter((p): p is S2Paper => Boolean(p));
        break;
      }
      case "recommend": {
        if (!req.positive.length) return [];
        const params = new URLSearchParams({ fields, limit: "100" });
        const data = await s2Fetch<{ recommendedPapers?: S2Paper[] }>(`${RECS}/papers?${params}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ positivePaperIds: req.positive.slice(0, 40), negativePaperIds: req.negative.slice(0, 40) }),
        });
        papers = data.recommendedPapers ?? [];
        break;
      }
    }
    const start = isoDay(ctx.window.start);
    const end = isoDay(ctx.window.end);
    return papers
      .filter((p) => p.publicationDate && p.publicationDate >= start && p.publicationDate <= end)
      .map((p) => normalizeS2Paper(p, task.signal))
      .filter((r): r is RawResult => r !== null)
      .slice(0, req.mode === "search" ? ctx.maxResults * 2 : 40);
  }
}

function surname(name: string): string {
  const parts = name.toLowerCase().replace(/[^\p{L}\s-]/gu, " ").trim().split(/\s+/);
  return parts[parts.length - 1] ?? "";
}

function nameMatches(candidate: string | null | undefined, person: string | undefined): boolean {
  if (!candidate || !person) return false;
  const a = surname(candidate);
  const b = surname(person);
  if (!a || a !== b) return false;
  return candidate.trim()[0]?.toLowerCase() === person.trim()[0]?.toLowerCase();
}

const tokens = (s: string) => new Set(s.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((t) => t.length > 2));

export interface S2Resolution {
  s2AuthorId?: string;
  displayName?: string;
  confidence: "high" | "medium" | "low";
  paperIds: string[];
  paperTitles: string[];
  coauthorIds: string[];
  coauthorNames: string[];
  note?: string;
}

/**
 * Resolve the person to a Semantic Scholar author: an explicit id wins; otherwise match the person's own paper
 * titles (from Google Scholar or their homepage) and pick the author they share; otherwise search by name and
 * affiliation. Then load their papers and frequent co-authors.
 */
export async function resolveS2Author(input: {
  forcedId?: string;
  name?: string;
  affiliations?: string[];
  paperTitles?: string[];
  deadlineAt?: number;
}): Promise<S2Resolution> {
  const empty = (note: string): S2Resolution => ({ confidence: "low", paperIds: [], paperTitles: [], coauthorIds: [], coauthorNames: [], note });
  const timeLeft = () => (input.deadlineAt ?? Infinity) - Date.now() > 15000;
  let authorId: string | undefined;
  let displayName: string | undefined;
  let confidence: S2Resolution["confidence"] = "low";
  let note: string | undefined;

  if (input.forcedId) {
    const a = await s2Fetch<S2Author>(`${GRAPH}/author/${encodeURIComponent(input.forcedId)}?fields=name,affiliations,paperCount`).catch(() => null);
    if (!a?.authorId) return empty(`Semantic Scholar author ${input.forcedId} was not found.`);
    authorId = a.authorId;
    displayName = a.name;
    confidence = "high";
  }

  // Title matching: the author who appears on several of the person's own papers is them.
  if (!authorId && input.paperTitles?.length && input.name) {
    const tally = new Map<string, { n: number; name: string }>();
    for (const title of input.paperTitles.slice(0, 5)) {
      if (!timeLeft()) break;
      const params = new URLSearchParams({ query: title, fields: "paperId,title,authors" });
      const hit = await s2Fetch<{ data?: S2Paper[] }>(`${GRAPH}/paper/search/match?${params}`).catch(() => null);
      for (const a of hit?.data?.[0]?.authors ?? []) {
        if (!a.authorId || !nameMatches(a.name, input.name)) continue;
        const cur = tally.get(a.authorId) ?? { n: 0, name: a.name ?? "" };
        tally.set(a.authorId, { n: cur.n + 1, name: cur.name });
      }
      await new Promise((r) => setTimeout(r, 1100));
    }
    const best = [...tally.entries()].sort((a, b) => b[1].n - a[1].n)[0];
    if (best) {
      authorId = best[0];
      displayName = best[1].name;
      confidence = best[1].n >= 2 ? "high" : "medium";
    }
  }

  if (!authorId && input.name) {
    const params = new URLSearchParams({ query: input.name, fields: "name,affiliations,paperCount,citationCount", limit: "10" });
    const res = await s2Fetch<{ data?: S2Author[] }>(`${GRAPH}/author/search?${params}`);
    const aff = new Set((input.affiliations ?? []).flatMap((a) => [...tokens(a)]));
    const scored = (res.data ?? [])
      .map((a) => {
        const overlap = (a.affiliations ?? []).flatMap((x) => [...tokens(x)]).filter((t) => aff.has(t)).length;
        return { a, score: overlap * 10 + Math.log10((a.paperCount ?? 0) + 1) };
      })
      .sort((x, y) => y.score - x.score);
    if (scored.length) {
      const [best, second] = scored;
      authorId = best.a.authorId;
      displayName = best.a.name;
      confidence = best.score >= 10 && (!second || best.score - second.score >= 5) ? "medium" : "low";
      if (confidence === "low") {
        note = `Several Semantic Scholar authors are named "${input.name}". Add your Google Scholar profile as a source, or set your Semantic Scholar author ID on the Profile page.`;
      }
    }
  }

  if (!authorId) return empty("No matching Semantic Scholar author.");

  // A guess between several people with this name: say who it was, but don't load or use their papers.
  if (confidence === "low") {
    return { s2AuthorId: authorId, displayName, confidence, paperIds: [], paperTitles: [], coauthorIds: [], coauthorNames: [], note };
  }

  const params = new URLSearchParams({ fields: "paperId,title,year,citationCount,authors", limit: "100" });
  const papers = (await s2Fetch<{ data?: S2Paper[] }>(`${GRAPH}/author/${encodeURIComponent(authorId)}/papers?${params}`)).data ?? [];
  const byCitations = [...papers].sort((a, b) => (b.citationCount ?? 0) - (a.citationCount ?? 0));
  const byYear = [...papers].sort((a, b) => (b.year ?? 0) - (a.year ?? 0));
  const seeds = [...new Set([...byCitations.slice(0, 12), ...byYear.slice(0, 6)].map((p) => p.paperId).filter((id): id is string => Boolean(id)))];

  const counts = new Map<string, { n: number; name: string }>();
  for (const p of papers)
    for (const a of p.authors ?? []) {
      if (!a.authorId || a.authorId === authorId) continue;
      const cur = counts.get(a.authorId) ?? { n: 0, name: a.name ?? "" };
      counts.set(a.authorId, { n: cur.n + 1, name: cur.name });
    }
  const coauthors = [...counts.entries()].filter(([, v]) => v.n >= 2).sort((a, b) => b[1].n - a[1].n).slice(0, 12);

  return {
    s2AuthorId: authorId,
    displayName,
    confidence,
    paperIds: seeds,
    // A paper that is both highly cited and recent is listed once.
    paperTitles: [...new Set([...byCitations.slice(0, 12), ...byYear.slice(0, 6)].map((p) => p.title ?? "").filter(Boolean))].slice(0, 18),
    coauthorIds: coauthors.map(([id]) => id),
    coauthorNames: coauthors.map(([, v]) => v.name),
    note,
  };
}
