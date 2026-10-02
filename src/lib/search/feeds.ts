import { XMLParser } from "fast-xml-parser";
import { fetchPage } from "../extract";
import { stripTags, truncate } from "../util/text";
import { domainOf } from "../util/url";
import { ProviderError, type RawResult, type SearchProvider, type SearchTask } from "./types";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@",
  textNodeName: "#text",
  removeNSPrefix: true,
  processEntities: true,
  htmlEntities: true,
});

type Rec = Record<string, unknown>;

function asArray<T>(v: T | T[] | undefined | null): T[] {
  return v == null ? [] : Array.isArray(v) ? v : [v];
}

function text(n: unknown): string {
  if (n == null) return "";
  if (typeof n === "string" || typeof n === "number") return String(n);
  if (typeof n === "object" && "#text" in (n as object)) return String((n as Rec)["#text"] ?? "");
  return "";
}

/** Atom links: prefer rel="alternate" (or no rel) over self/edit links. */
function atomLink(link: unknown): string {
  const links = asArray(link as Rec | Rec[] | string);
  for (const l of links) {
    if (typeof l === "string") return l;
    const rel = l["@rel"] as string | undefined;
    if (!rel || rel === "alternate") return String(l["@href"] ?? "");
  }
  const first = links[0];
  return typeof first === "object" && first ? String(first["@href"] ?? "") : "";
}

export interface FeedEntry {
  title: string;
  link: string;
  summary: string;
  date?: string;
}

/** Parse RSS 2.0, RSS 1.0 (RDF) and Atom feeds. */
export function parseFeed(xml: string): { title?: string; entries: FeedEntry[] } {
  const doc = parser.parse(xml) as Rec;
  const rss = doc.rss as Rec | undefined;
  const rdf = doc.RDF as Rec | undefined;
  const atom = doc.feed as Rec | undefined;
  if (rss || rdf) {
    const channel = ((rss?.channel ?? rdf?.channel) as Rec | undefined) ?? {};
    const items = asArray((channel.item ?? rdf?.item) as Rec | Rec[] | undefined);
    return {
      title: stripTags(text(channel.title)) || undefined,
      entries: items.map((it) => ({
        title: stripTags(text(it.title)),
        link: text(it.link).trim() || String((it as Rec)["@about"] ?? ""),
        summary: stripTags(text(it.description) || text(it.encoded)),
        date: text(it.pubDate) || text(it.date) || undefined,
      })),
    };
  }
  if (atom) {
    return {
      title: stripTags(text(atom.title)) || undefined,
      entries: asArray(atom.entry as Rec | Rec[] | undefined).map((e) => ({
        title: stripTags(text(e.title)),
        link: atomLink(e.link).trim(),
        summary: stripTags(text(e.summary) || text(e.content)),
        date: text(e.published) || text(e.updated) || undefined,
      })),
    };
  }
  return { entries: [] };
}

/** Reads a watchlist feed (lab news, journal table of contents, blog) and keeps entries from the window. */
export class FeedProvider implements SearchProvider {
  readonly name = "feed";
  async search(task: SearchTask): Promise<RawResult[]> {
    if (!task.feedUrl) return [];
    let body: string;
    try {
      body = (await fetchPage(task.feedUrl, 15000)).body;
    } catch (e) {
      throw new ProviderError(this.name, `${domainOf(task.feedUrl)}: ${e instanceof Error ? e.message : String(e)}`);
    }
    const feed = parseFeed(body);
    return feed.entries
      .filter((e) => e.title && /^https?:\/\//.test(e.link))
      .slice(0, 40)
      .map((e) => ({
        url: e.link,
        title: e.title,
        snippet: truncate(e.summary, 600),
        content: e.summary.length > 600 ? e.summary : undefined,
        publishedAt: e.date,
        dateSource: e.date ? ("metadata" as const) : ("unknown" as const),
        publisher: feed.title ?? domainOf(task.feedUrl!),
        signals: ["watchlist"],
        provider: this.name,
      }));
  }
}
