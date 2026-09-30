import { config } from "../config";
import { isoDay } from "../util/dates";
import { tokenize, truncate } from "../util/text";
import { httpJson, type RawResult, type SearchContext, type SearchProvider, type SearchTask } from "./types";

const BASE = "https://api.openalex.org";

interface OAWork {
  id: string;
  doi?: string | null;
  title?: string | null;
  display_name?: string | null;
  publication_date?: string;
  type?: string;
  language?: string | null;
  cited_by_count?: number;
  abstract_inverted_index?: Record<string, number[]> | null;
  primary_location?: {
    landing_page_url?: string | null;
    source?: { display_name?: string | null; host_organization_name?: string | null } | null;
  } | null;
  authorships?: { author?: { id?: string; display_name?: string } }[];
}

interface OAAuthor {
  id: string;
  display_name: string;
  orcid?: string | null;
  works_count?: number;
  cited_by_count?: number;
  last_known_institutions?: { display_name?: string }[];
  affiliations?: { institution?: { display_name?: string } }[];
}

const WORK_FIELDS =
  "id,doi,title,display_name,publication_date,type,language,cited_by_count,abstract_inverted_index,primary_location,authorships";

function withAuth(params: URLSearchParams): URLSearchParams {
  if (config.search.openalexKey) params.set("api_key", config.search.openalexKey);
  if (config.search.openalexMailto) params.set("mailto", config.search.openalexMailto);
  return params;
}

export function invertAbstract(index?: Record<string, number[]> | null): string {
  if (!index) return "";
  const words: string[] = [];
  for (const [word, positions] of Object.entries(index)) for (const p of positions) words[p] = word;
  return words.filter(Boolean).join(" ");
}

export function normalizeWork(w: OAWork, provider = "openalex", signal?: string): RawResult | null {
  const title = w.display_name ?? w.title;
  if (!title) return null;
  const abstract = invertAbstract(w.abstract_inverted_index);
  const url = w.doi ?? w.primary_location?.landing_page_url ?? w.id;
  const venue = w.primary_location?.source?.display_name ?? undefined;
  return {
    url,
    title,
    snippet: truncate(abstract, 600),
    content: abstract || undefined,
    publishedAt: w.publication_date,
    dateSource: "metadata",
    publisher: venue ?? w.primary_location?.source?.host_organization_name ?? "OpenAlex",
    venue: venue ?? undefined,
    doi: w.doi ? w.doi.replace(/^https?:\/\/doi\.org\//i, "").toLowerCase() : undefined,
    authors: (w.authorships ?? []).map((a) => a.author?.display_name).filter((n): n is string => Boolean(n)).slice(0, 12),
    signals: signal ? [signal] : undefined,
    provider,
  };
}

/** OpenAlex works search and filters (scholarly literature, all fields). */
export class OpenAlexProvider implements SearchProvider {
  readonly name = "openalex";

  async search(task: SearchTask, ctx: SearchContext): Promise<RawResult[]> {
    const dateFilter = `from_publication_date:${isoDay(ctx.window.start)},to_publication_date:${isoDay(ctx.window.end)}`;
    const filter = task.openalexFilter ? `${task.openalexFilter},${dateFilter}` : dateFilter;
    const params = withAuth(
      new URLSearchParams({
        filter: `${filter},type:!paratext`,
        per_page: String(Math.min(ctx.maxResults, 25)),
        select: WORK_FIELDS,
      }),
    );
    if (task.openalexFilter) {
      params.set("sort", "publication_date:desc");
    } else {
      params.set("search", task.query);
      params.set("sort", "relevance_score:desc");
    }
    const data = await httpJson<{ results?: OAWork[] }>(this.name, `${BASE}/works?${params}`);
    return (data.results ?? [])
      .map((w) => normalizeWork(w, this.name, task.signal))
      .filter((r): r is RawResult => r !== null);
  }
}

export interface AuthorResolution {
  openalexAuthorId?: string;
  displayName?: string;
  confidence: "high" | "medium" | "low";
  topWorkIds: string[];
  coauthorIds: string[];
  note?: string;
}

function shortId(id: string): string {
  return id.replace(/^https?:\/\/openalex\.org\//, "");
}

async function fetchAuthor(pathOrQuery: string): Promise<OAAuthor[]> {
  const url = `${BASE}/${pathOrQuery}${pathOrQuery.includes("?") ? "&" : "?"}${withAuth(new URLSearchParams())}`;
  const data = await httpJson<OAAuthor | { results?: OAAuthor[] }>("openalex", url);
  if ("results" in data) return data.results ?? [];
  return data && (data as OAAuthor).id ? [data as OAAuthor] : [];
}

function institutionNames(a: OAAuthor): string[] {
  return [
    ...(a.last_known_institutions ?? []).map((i) => i.display_name ?? ""),
    ...(a.affiliations ?? []).map((i) => i.institution?.display_name ?? ""),
  ].filter(Boolean);
}

/**
 * Resolve the person to an OpenAlex author using an explicit id, ORCID, or name + affiliation.
 * Returns confidence so the pipeline can avoid author-specific searches when ambiguous.
 */
export async function resolveAuthor(input: {
  forcedId?: string;
  orcid?: string;
  name?: string;
  affiliations?: string[];
  paperTitles?: string[];
}): Promise<AuthorResolution> {
  let author: OAAuthor | undefined;
  let confidence: AuthorResolution["confidence"] = "low";
  let note: string | undefined;

  if (input.forcedId) {
    author = (await fetchAuthor(`authors/${encodeURIComponent(input.forcedId)}`))[0];
    confidence = author ? "high" : "low";
    if (!author) note = `OpenAlex author ${input.forcedId} not found.`;
  } else if (input.orcid) {
    author = (await fetchAuthor(`authors/orcid:${input.orcid}`))[0];
    if (author) confidence = "high";
  }

  if (!author && input.name) {
    const candidates = await fetchAuthor(`authors?search=${encodeURIComponent(input.name)}&per_page=10`);
    const affTokens = new Set((input.affiliations ?? []).flatMap((a) => tokenize(a)));
    const scored = candidates
      .map((c) => {
        const inst = institutionNames(c).flatMap((n) => tokenize(n));
        const overlap = inst.filter((t) => affTokens.has(t)).length;
        return { c, score: overlap * 10 + Math.log10((c.works_count ?? 0) + 1) };
      })
      .sort((a, b) => b.score - a.score);
    if (scored.length) {
      const [best, second] = scored;
      author = best.c;
      const affMatch = best.score >= 10;
      const clearLead = !second || best.score - second.score >= 5;
      confidence = affMatch && clearLead ? "medium" : "low";
      if (confidence === "low") {
        note = `Several OpenAlex authors match "${input.name}". Set your OpenAlex author ID in Profile settings for citation tracking.`;
      }
    }
  }

  if (!author) return { confidence: "low", topWorkIds: [], coauthorIds: [], note: note ?? "No matching OpenAlex author." };

  const authorId = shortId(author.id);
  const params = withAuth(
    new URLSearchParams({
      filter: `author.id:${authorId}`,
      sort: "cited_by_count:desc",
      per_page: "40",
      select: "id,title,authorships",
    }),
  );
  const works = await httpJson<{ results?: { id: string; title?: string; authorships?: OAWork["authorships"] }[] }>(
    "openalex",
    `${BASE}/works?${params}`,
  );
  const results = works.results ?? [];

  // Raise confidence when the author's works overlap the paper titles found on the user's pages.
  if (confidence !== "high" && input.paperTitles?.length) {
    const known = new Set(input.paperTitles.map((t) => t.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()));
    const hits = results.filter((w) => known.has((w.title ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim())).length;
    if (hits >= 2) {
      confidence = "high";
      note = undefined;
    }
  }

  const counts = new Map<string, number>();
  for (const w of results)
    for (const a of w.authorships ?? []) {
      const id = a.author?.id ? shortId(a.author.id) : undefined;
      if (id && id !== authorId) counts.set(id, (counts.get(id) ?? 0) + 1);
    }
  const coauthorIds = [...counts.entries()]
    .filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([id]) => id);

  return {
    openalexAuthorId: authorId,
    displayName: author.display_name,
    confidence,
    topWorkIds: results.slice(0, 40).map((w) => shortId(w.id)),
    coauthorIds,
    note,
  };
}
