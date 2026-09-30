import { XMLParser } from "fast-xml-parser";
import { stripTags } from "../util/text";
import { httpText, withSiteFilter, type RawResult, type SearchContext, type SearchProvider, type SearchTask } from "./types";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@",
  textNodeName: "#text",
  removeNSPrefix: true,
  processEntities: true,
  htmlEntities: true,
});

type Node = string | { "#text"?: string; "@url"?: string; "@href"?: string; [k: string]: unknown };

function text(n: unknown): string {
  if (n == null) return "";
  if (typeof n === "string" || typeof n === "number") return String(n);
  if (typeof n === "object" && "#text" in (n as object)) return String((n as { "#text": unknown })["#text"] ?? "");
  return "";
}

function asArray<T>(v: T | T[] | undefined): T[] {
  return v == null ? [] : Array.isArray(v) ? v : [v];
}

export interface RssItem {
  title: string;
  link: string;
  description: string;
  pubDate?: string;
  source?: string;
  sourceUrl?: string;
  image?: string;
}

export function parseRss(xml: string): RssItem[] {
  const doc = parser.parse(xml) as { rss?: { channel?: { item?: unknown } } };
  const items = asArray(doc.rss?.channel?.item as Record<string, Node>[] | Record<string, Node> | undefined);
  return items.map((it) => {
    const src = it.source as Node | undefined;
    const image = it.Image ?? it.image;
    return {
      title: stripTags(text(it.title)),
      link: text(it.link).trim(),
      description: stripTags(text(it.description)),
      pubDate: text(it.pubDate) || undefined,
      source: text(it.Source) || text(src) || undefined,
      sourceUrl: typeof src === "object" ? (src?.["@url"] as string | undefined) : undefined,
      image: typeof image === "string" ? image : text(image) || undefined,
    };
  });
}

/** Bing wraps result URLs in an apiclick redirect; the real URL is in the `url` param. */
export function unwrapBingLink(link: string): string {
  try {
    const u = new URL(link);
    if (u.hostname.endsWith("bing.com")) {
      const target = u.searchParams.get("url");
      if (target) return target;
    }
  } catch {
    // ignore
  }
  return link;
}

/** Keyless Bing News RSS (past 7 days). Fallback when no search API key is configured. */
export class BingNewsRssProvider implements SearchProvider {
  readonly name = "bing-news-rss";
  async search(task: SearchTask, ctx: SearchContext): Promise<RawResult[]> {
    const params = new URLSearchParams({
      q: task.query,
      format: "rss",
      qft: 'interval="8"',
      setlang: task.lang === "zh" ? "zh-hans" : "en-us",
    });
    const xml = await httpText(this.name, `https://www.bing.com/news/search?${params}`);
    return parseRss(xml)
      .slice(0, ctx.maxResults)
      .filter((i) => i.link && i.title)
      .map((i) => ({
        url: unwrapBingLink(i.link),
        title: i.title,
        snippet: i.description,
        publishedAt: i.pubDate,
        dateSource: i.pubDate ? "provider" : "unknown",
        publisher: i.source,
        imageUrl: i.image,
        provider: this.name,
      }));
  }
}

/** Keyless Bing web RSS, used for site-restricted queries (WeChat, patents, jobs) without an API key. */
export class BingWebRssProvider implements SearchProvider {
  readonly name = "bing-web-rss";
  async search(task: SearchTask, ctx: SearchContext): Promise<RawResult[]> {
    const params = new URLSearchParams({
      q: withSiteFilter(task.query, task.includeDomains),
      format: "rss",
      filters: 'ex1:"ez2"',
      setlang: task.lang === "zh" ? "zh-hans" : "en-us",
    });
    const xml = await httpText(this.name, `https://www.bing.com/search?${params}`);
    return parseRss(xml)
      .slice(0, ctx.maxResults)
      .filter((i) => i.link && i.title)
      .map((i) => ({
        url: unwrapBingLink(i.link),
        title: i.title,
        snippet: i.description,
        publishedAt: i.pubDate,
        dateSource: i.pubDate ? "provider" : "unknown",
        provider: this.name,
      }));
  }
}

/** Keyless Google News RSS (when:7d). Links are Google News redirects; titles carry " - Publisher". */
export class GoogleNewsRssProvider implements SearchProvider {
  readonly name = "google-news-rss";
  async search(task: SearchTask, ctx: SearchContext): Promise<RawResult[]> {
    const zh = task.lang === "zh";
    const params = new URLSearchParams({
      q: `${task.query} when:7d`,
      hl: zh ? "zh-CN" : "en-US",
      gl: zh ? "CN" : "US",
      ceid: zh ? "CN:zh-Hans" : "US:en",
    });
    const xml = await httpText(this.name, `https://news.google.com/rss/search?${params}`);
    return parseRss(xml)
      .slice(0, ctx.maxResults)
      .filter((i) => i.link && i.title)
      .map((i) => {
        const title = i.source && i.title.endsWith(` - ${i.source}`) ? i.title.slice(0, -(i.source.length + 3)) : i.title;
        return {
          url: i.link,
          title,
          snippet: "",
          publishedAt: i.pubDate,
          dateSource: i.pubDate ? ("provider" as const) : ("unknown" as const),
          publisher: i.source,
          provider: this.name,
        };
      });
  }
}
