import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";
import type { DateSource } from "../types";
import { parseDate } from "../util/dates";
import { collapseWhitespace, decodeEntities } from "../util/text";

export interface ExtractedPage {
  title?: string;
  text: string;
  description?: string;
  siteName?: string;
  imageUrl?: string;
  publishedAt?: string;
  dateSource: DateSource;
  lang?: string;
}

const DATE_META = [
  'meta[property="article:published_time"]',
  'meta[name="article:published_time"]',
  'meta[itemprop="datePublished"]',
  'meta[name="citation_publication_date"]',
  'meta[name="citation_online_date"]',
  'meta[name="citation_date"]',
  'meta[name="dc.date.issued"]',
  'meta[name="DC.date.issued"]',
  'meta[name="dc.date"]',
  'meta[name="DC.date"]',
  'meta[name="publish-date"]',
  'meta[name="publish_date"]',
  'meta[name="pubdate"]',
  'meta[name="date"]',
  'meta[property="og:published_time"]',
  'meta[name="parsely-pub-date"]',
  'meta[name="sailthru.date"]',
];

type Doc = ReturnType<typeof parseHTML>["document"];

function meta(doc: Doc, selectors: string[]): string | undefined {
  for (const sel of selectors) {
    const v = doc.querySelector(sel)?.getAttribute("content");
    if (v && v.trim()) return v.trim();
  }
  return undefined;
}

function jsonLdDates(doc: Doc): string | undefined {
  for (const s of doc.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      const data = JSON.parse(s.textContent ?? "") as unknown;
      const stack: unknown[] = [data];
      while (stack.length) {
        const node = stack.pop();
        if (!node || typeof node !== "object") continue;
        if (Array.isArray(node)) {
          stack.push(...node);
          continue;
        }
        const rec = node as Record<string, unknown>;
        if (typeof rec.datePublished === "string") return rec.datePublished;
        if (rec["@graph"]) stack.push(rec["@graph"]);
      }
    } catch {
      // ignore malformed JSON-LD
    }
  }
  return undefined;
}

/** Find the publication date from metadata, JSON-LD, WeChat inline script, or <time> elements. */
export function findPublishedDate(doc: Doc, html: string): { date?: string; source: DateSource } {
  const candidates: [string | undefined, DateSource][] = [
    [meta(doc, DATE_META), "metadata"],
    [jsonLdDates(doc), "metadata"],
  ];
  // WeChat articles expose the publish timestamp in inline scripts.
  const wx = html.match(/\bvar\s+ct\s*=\s*"(\d{10})"/) ?? html.match(/"create_time"\s*:\s*"?(\d{10})/);
  if (wx) candidates.push([new Date(Number(wx[1]) * 1000).toISOString(), "metadata"]);
  const timeEl = doc.querySelector("article time[datetime], time[datetime]")?.getAttribute("datetime");
  candidates.push([timeEl ?? undefined, "page"]);
  for (const [value, source] of candidates) {
    const d = parseDate(value);
    if (d) return { date: d.toISOString(), source };
  }
  return { source: "unknown" };
}

function absolutize(src: string | undefined | null, base: string): string | undefined {
  if (!src) return undefined;
  try {
    const u = new URL(src, base);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : undefined;
  } catch {
    return undefined;
  }
}

export function extractFromHtml(html: string, url: string): ExtractedPage {
  const { document } = parseHTML(html);
  const doc = document as unknown as Doc;
  const title =
    meta(doc, ['meta[property="og:title"]', 'meta[name="twitter:title"]', 'meta[name="citation_title"]']) ??
    doc.querySelector("title")?.textContent?.trim() ??
    undefined;
  const description = meta(doc, ['meta[name="description"]', 'meta[property="og:description"]', 'meta[name="citation_abstract"]']);
  const siteName = meta(doc, ['meta[property="og:site_name"]', 'meta[name="application-name"]', 'meta[name="citation_journal_title"]']);
  const imageUrl = absolutize(meta(doc, ['meta[property="og:image"]', 'meta[name="twitter:image"]']), url);
  const lang = doc.documentElement?.getAttribute("lang") ?? undefined;
  const { date, source } = findPublishedDate(doc, html);

  let text = "";
  try {
    // Readability mutates the DOM, so run it on a fresh parse.
    const { document: fresh } = parseHTML(html);
    const article = new Readability(fresh as unknown as Document, { charThreshold: 200 }).parse();
    text = article?.textContent ?? "";
  } catch {
    text = "";
  }
  if (text.trim().length < 200) {
    for (const el of doc.querySelectorAll("script,style,noscript,nav,footer,header,svg,form")) el.remove();
    text = doc.body?.textContent ?? "";
  }
  return {
    title: title ? decodeEntities(title) : undefined,
    text: collapseWhitespace(text),
    description: description ? decodeEntities(description) : undefined,
    siteName: siteName ? decodeEntities(siteName) : undefined,
    imageUrl,
    publishedAt: date,
    dateSource: source,
    lang,
  };
}

/** Whole-page visible text (minus scripts/navigation); keeps lists that Readability may drop. */
export function bodyText(html: string): string {
  const { document } = parseHTML(html);
  const doc = document as unknown as Doc;
  for (const el of doc.querySelectorAll("script,style,noscript,svg,form,iframe")) el.remove();
  return collapseWhitespace(doc.body?.textContent ?? "");
}

export interface ScholarProfile {
  name?: string;
  affiliation?: string;
  interests: string[];
  paperTitles: string[];
}

/** Parse a Google Scholar citations profile page (if it could be fetched). */
export function parseScholarProfile(html: string): ScholarProfile | null {
  if (!html.includes("gsc_prf")) return null;
  const { document } = parseHTML(html);
  const doc = document as unknown as Doc;
  const name = doc.querySelector("#gsc_prf_in")?.textContent?.trim();
  const affiliation = doc.querySelector(".gsc_prf_il")?.textContent?.trim();
  const interests = [...doc.querySelectorAll("#gsc_prf_int a")].map((a) => a.textContent?.trim() ?? "").filter(Boolean);
  const paperTitles = [...doc.querySelectorAll(".gsc_a_at")].map((a) => a.textContent?.trim() ?? "").filter(Boolean);
  return { name, affiliation, interests, paperTitles };
}

export function findOrcid(text: string): string | undefined {
  const m = text.match(/\b(\d{4}-\d{4}-\d{4}-\d{3}[\dX])\b/);
  return m?.[1];
}
