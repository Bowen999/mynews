import { truncate } from "../util/text";
import { httpJson, type RawResult, type SearchContext, type SearchProvider, type SearchTask } from "./types";

interface TavilyResponse {
  results?: {
    title?: string;
    url?: string;
    content?: string;
    raw_content?: string | null;
    published_date?: string;
    score?: number;
  }[];
}

/** Tavily search (https://tavily.com). Supports general and news indexes with a 1-week time range. */
export class TavilyProvider implements SearchProvider {
  readonly name = "tavily";
  constructor(private readonly apiKey: string) {}

  async search(task: SearchTask, ctx: SearchContext): Promise<RawResult[]> {
    const body: Record<string, unknown> = {
      query: task.query,
      topic: task.kind === "news" ? "news" : "general",
      time_range: "week",
      search_depth: "basic",
      max_results: Math.min(ctx.maxResults, 20),
      include_raw_content: "text",
      include_answer: false,
      include_images: false,
    };
    if (task.includeDomains?.length) body.include_domains = task.includeDomains;
    const data = await httpJson<TavilyResponse>(this.name, "https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify(body),
      timeoutMs: 30000,
    });
    return (data.results ?? [])
      .filter((r) => r.url && r.title)
      .map((r) => ({
        url: r.url!,
        title: r.title!,
        snippet: truncate(r.content ?? "", 600),
        content: r.raw_content ? truncate(r.raw_content, 9000) : undefined,
        publishedAt: r.published_date,
        dateSource: r.published_date ? "provider" : "unknown",
        provider: this.name,
      }));
  }

  /** Batch page extraction; used as a fallback when direct fetching fails. */
  async extract(urls: string[]): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    if (!urls.length) return out;
    const data = await httpJson<{ results?: { url: string; raw_content?: string }[] }>(this.name, "https://api.tavily.com/extract", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify({ urls: urls.slice(0, 20), extract_depth: "basic", format: "text" }),
      timeoutMs: 45000,
    });
    for (const r of data.results ?? []) if (r.url && r.raw_content) out.set(r.url, r.raw_content);
    return out;
  }
}
