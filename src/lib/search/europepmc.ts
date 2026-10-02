import { isoDay } from "../util/dates";
import { stripTags, truncate } from "../util/text";
import { httpJson, type RawResult, type SearchContext, type SearchProvider, type SearchTask } from "./types";

const BASE = "https://www.ebi.ac.uk/europepmc/webservices/rest/search";
const NAME = "europe-pmc";

export interface EpmcResult {
  id?: string;
  source?: string;
  pmid?: string;
  doi?: string;
  title?: string;
  authorString?: string;
  journalInfo?: { journal?: { title?: string } };
  firstPublicationDate?: string;
  abstractText?: string;
  bookOrReportDetails?: { publisher?: string };
}

/** Keep the query inside Europe PMC's Lucene syntax: plain words and balanced quotes only. */
export function epmcQuery(query: string, start: Date, end: Date): string {
  let q = query.replace(/[[\]{}()\\/^~*?!:]/g, " ").replace(/\s+/g, " ").trim();
  if ((q.match(/"/g) ?? []).length % 2) q = q.replace(/"/g, "");
  return `(${q}) AND (FIRST_PDATE:[${isoDay(start)} TO ${isoDay(end)}])`;
}

export function normalizeEpmc(r: EpmcResult, signal?: string): RawResult | null {
  if (!r.title || !r.firstPublicationDate) return null;
  const url = r.doi ? `https://doi.org/${r.doi.toLowerCase()}` : r.source && r.id ? `https://europepmc.org/article/${r.source}/${r.id}` : undefined;
  if (!url) return null;
  const abstract = stripTags(r.abstractText ?? "");
  const venue = r.journalInfo?.journal?.title ?? r.bookOrReportDetails?.publisher ?? (r.source === "PPR" ? "Preprint" : undefined);
  return {
    url,
    title: stripTags(r.title).replace(/\.$/, ""),
    snippet: truncate(abstract, 600),
    content: abstract || undefined,
    publishedAt: r.firstPublicationDate,
    dateSource: "metadata",
    publisher: venue ?? "Europe PMC",
    venue,
    doi: r.doi?.toLowerCase(),
    authors: (r.authorString ?? "")
      .replace(/\.$/, "")
      .split(/,\s*/)
      .filter(Boolean)
      .slice(0, 12),
    signals: signal ? [signal] : undefined,
    provider: NAME,
  };
}

/** Europe PMC (free, keyless): PubMed, PMC and life-science preprints (bioRxiv, medRxiv…), date-bounded server-side. */
export class EuropePmcProvider implements SearchProvider {
  readonly name = NAME;
  async search(task: SearchTask, ctx: SearchContext): Promise<RawResult[]> {
    const params = new URLSearchParams({
      query: epmcQuery(task.query, ctx.window.start, ctx.window.end),
      format: "json",
      resultType: "core",
      pageSize: String(Math.min(ctx.maxResults * 2, 25)),
    });
    const data = await httpJson<{ resultList?: { result?: EpmcResult[] } }>(NAME, `${BASE}?${params}`, { timeoutMs: 20000 });
    return (data.resultList?.result ?? []).map((r) => normalizeEpmc(r, task.signal)).filter((r): r is RawResult => r !== null);
  }
}
