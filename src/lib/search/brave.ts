import { stripTags } from "../util/text";
import { httpJson, withSiteFilter, type RawResult, type SearchContext, type SearchProvider, type SearchTask } from "./types";

interface BraveItem {
  title?: string;
  url?: string;
  description?: string;
  page_age?: string;
  age?: string;
  profile?: { name?: string };
  meta_url?: { hostname?: string };
  thumbnail?: { src?: string };
}

/** Brave Search API (https://brave.com/search/api) with freshness=pw (past week). */
export class BraveProvider implements SearchProvider {
  readonly name = "brave";
  constructor(private readonly apiKey: string) {}

  async search(task: SearchTask, ctx: SearchContext): Promise<RawResult[]> {
    const isNews = task.kind === "news";
    const params = new URLSearchParams({
      q: withSiteFilter(task.query, task.includeDomains),
      count: String(Math.min(ctx.maxResults, 20)),
      freshness: "pw",
      search_lang: task.lang === "zh" ? "zh-hans" : "en",
    });
    const url = `https://api.search.brave.com/res/v1/${isNews ? "news" : "web"}/search?${params}`;
    const data = await httpJson<{ results?: BraveItem[]; web?: { results?: BraveItem[] } }>(this.name, url, {
      headers: { Accept: "application/json", "X-Subscription-Token": this.apiKey },
    });
    const items = (isNews ? data.results : data.web?.results) ?? [];
    return items
      .filter((r) => r.url && r.title)
      .map((r) => ({
        url: r.url!,
        title: stripTags(r.title!),
        snippet: stripTags(r.description ?? ""),
        publishedAt: r.page_age ?? r.age,
        dateSource: r.page_age || r.age ? "provider" : "unknown",
        publisher: r.profile?.name ?? r.meta_url?.hostname,
        imageUrl: r.thumbnail?.src,
        provider: this.name,
      }));
  }
}
