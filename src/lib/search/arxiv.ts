import { XMLParser } from "fast-xml-parser";
import { collapseWhitespace, tokenize, truncate } from "../util/text";
import { httpText, type RawResult, type SearchContext, type SearchProvider, type SearchTask } from "./types";

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@", removeNSPrefix: true });

function asArray<T>(v: T | T[] | undefined): T[] {
  return v == null ? [] : Array.isArray(v) ? v : [v];
}

function stamp(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}`;
}

export function buildArxivQuery(query: string, start: Date, end: Date): string {
  const terms = tokenize(query)
    .filter((t) => /^[a-z0-9\-]+$/.test(t))
    .slice(0, 5);
  const q = terms.length ? terms.map((t) => `all:${t}`).join(" AND ") : `all:"${query}"`;
  return `(${q}) AND submittedDate:[${stamp(start)} TO ${stamp(end)}]`;
}

interface ArxivEntry {
  id?: string;
  title?: string;
  summary?: string;
  published?: string;
  author?: { name?: string } | { name?: string }[];
  primary_category?: { "@term"?: string };
  journal_ref?: string;
  doi?: string;
}

export function parseArxivFeed(xml: string, provider = "arxiv"): RawResult[] {
  const doc = parser.parse(xml) as { feed?: { entry?: ArxivEntry | ArxivEntry[] } };
  return asArray(doc.feed?.entry)
    .filter((e) => e.id && e.title)
    .map((e) => {
      const id = String(e.id).replace(/^http:/, "https:");
      const abs = id.replace(/v\d+$/, "");
      const summary = collapseWhitespace(String(e.summary ?? ""));
      return {
        url: abs,
        title: String(e.title).replace(/\s+/g, " ").trim(),
        snippet: truncate(summary, 600),
        content: summary,
        publishedAt: e.published,
        dateSource: "metadata" as const,
        publisher: "arXiv",
        venue: e.primary_category?.["@term"] ? `arXiv ${e.primary_category["@term"]}` : "arXiv",
        authors: asArray(e.author)
          .map((a) => a?.name)
          .filter((n): n is string => Boolean(n)),
        doi: e.doi ? String(e.doi).toLowerCase() : undefined,
        provider,
      };
    });
}

/** arXiv API (free). Only useful for fields with arXiv coverage; results are date-bounded server-side. */
export class ArxivProvider implements SearchProvider {
  readonly name = "arxiv";
  /** arXiv asks clients to space requests about 3 seconds apart. */
  readonly minIntervalMs = 3000;
  async search(task: SearchTask, ctx: SearchContext): Promise<RawResult[]> {
    const params = new URLSearchParams({
      search_query: buildArxivQuery(task.query, ctx.window.start, ctx.window.end),
      sortBy: "submittedDate",
      sortOrder: "descending",
      max_results: String(Math.min(ctx.maxResults, 25)),
    });
    const xml = await httpText(this.name, `https://export.arxiv.org/api/query?${params}`, { timeoutMs: 25000 });
    return parseArxivFeed(xml, this.name);
  }
}
