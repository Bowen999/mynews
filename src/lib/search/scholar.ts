import { parseHTML } from "linkedom";
import { config } from "../config";
import { jinaHtml } from "../extract";
import { collapseWhitespace, truncate } from "../util/text";
import { ProviderError, type RawResult, type SearchContext, type SearchProvider, type SearchTask } from "./types";

const NAME = "google-scholar";
const BASE = "https://scholar.google.com/scholar";

type Doc = ReturnType<typeof parseHTML>["document"];

export function isScholarBlocked(html: string): boolean {
  return /gs_captcha|id="recaptcha"|unusual traffic|not a robot|sorry\/index/i.test(html);
}

/** "3 days ago" / "11 hours ago" → days (0 for hours/minutes). */
export function parseAge(text: string): number | undefined {
  const m = text.match(/(\d+)\s+(day|hour|minute)s?\s+ago/i);
  if (!m) return undefined;
  return m[2].toLowerCase() === "day" ? Number(m[1]) : 0;
}

/**
 * Parse a Google Scholar results page sorted by date (`scisbd=1`). Each snippet starts with an age such as
 * "3 days ago -", which gives an approximate date; results without one are skipped.
 */
export function parseScholarResults(html: string, now = new Date(), signal?: string): RawResult[] {
  const { document } = parseHTML(html);
  const doc = document as unknown as Doc;
  const out: RawResult[] = [];
  for (const block of doc.querySelectorAll(".gs_ri")) {
    const link = block.querySelector("h3.gs_rt a, .gs_rt a");
    const href = link?.getAttribute("href");
    if (!link || !href || !/^https?:\/\//.test(href)) continue; // [CITATION] entries have no link
    const title = collapseWhitespace(link.textContent ?? "");
    const snippetEl = block.querySelector(".gs_rs");
    const ageText = snippetEl?.querySelector(".gs_age")?.textContent ?? snippetEl?.textContent?.slice(0, 40) ?? "";
    const days = parseAge(ageText);
    if (days === undefined || !title) continue;
    let snippet = collapseWhitespace(snippetEl?.textContent ?? "");
    snippet = snippet.replace(/^\d+\s+(?:day|hour|minute)s?\s+ago\s*[-–—]\s*/i, "");
    const meta = collapseWhitespace(block.querySelector(".gs_a")?.textContent ?? "");
    const [authorPart, venuePart] = meta.split(/\s+-\s+/);
    const venue = venuePart?.replace(/,?\s*\d{4}$/, "").trim() || undefined;
    out.push({
      url: href,
      title,
      snippet: truncate(snippet, 600),
      publishedAt: new Date(now.getTime() - days * 86400000).toISOString(),
      dateSource: "provider",
      publisher: venue,
      venue,
      authors: authorPart
        ?.replace(/…$/, "")
        .split(/,\s*/)
        .map((a) => a.trim())
        .filter(Boolean)
        .slice(0, 12),
      signals: signal ? [signal] : undefined,
      provider: NAME,
    });
  }
  return out;
}

export function scholarSearchUrl(task: Pick<SearchTask, "query" | "scholarCites">): string {
  const params = new URLSearchParams({ hl: "en", as_sdt: "0,5", scisbd: "1" });
  if (task.scholarCites) params.set("cites", task.scholarCites);
  else params.set("q", task.query);
  return `${BASE}?${params}`;
}

/**
 * Google Scholar, read through Jina Reader: newest papers for a query, or newest papers citing one of your
 * papers. Scholar has no API and sometimes answers with a captcha; the provider then stops for this run.
 */
export class GoogleScholarProvider implements SearchProvider {
  readonly name = NAME;
  /** Jina Reader allows ~20 requests/minute without a key. */
  get minIntervalMs() {
    return config.search.jinaKey ? 500 : 3200;
  }

  async search(task: SearchTask, ctx: SearchContext): Promise<RawResult[]> {
    let html: string;
    try {
      html = await jinaHtml(scholarSearchUrl(task));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new ProviderError(this.name, msg, /HTTP (401|402|403|429)/.test(msg));
    }
    if (isScholarBlocked(html)) throw new ProviderError(this.name, "Google Scholar asked for a captcha; skipped for this run", true);
    return parseScholarResults(html, ctx.window.end, task.signal).slice(0, ctx.maxResults);
  }
}
