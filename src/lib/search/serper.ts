import { httpJson, withSiteFilter, type RawResult, type SearchContext, type SearchProvider, type SearchTask } from "./types";

interface SerperItem {
  title?: string;
  link?: string;
  snippet?: string;
  date?: string;
  source?: string;
  imageUrl?: string;
}

/** Google results via Serper (https://serper.dev), restricted to the past week (tbs=qdr:w). */
export class SerperProvider implements SearchProvider {
  readonly name = "serper";
  constructor(private readonly apiKey: string) {}

  async search(task: SearchTask, ctx: SearchContext): Promise<RawResult[]> {
    const endpoint = task.kind === "news" ? "news" : "search";
    const data = await httpJson<{ organic?: SerperItem[]; news?: SerperItem[] }>(
      this.name,
      `https://google.serper.dev/${endpoint}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-API-KEY": this.apiKey },
        body: JSON.stringify({
          q: withSiteFilter(task.query, task.includeDomains),
          tbs: "qdr:w",
          num: Math.min(ctx.maxResults, 20),
          hl: task.lang === "zh" ? "zh-cn" : "en",
        }),
      },
    );
    const items = (endpoint === "news" ? data.news : data.organic) ?? [];
    return items
      .filter((r) => r.link && r.title)
      .map((r) => ({
        url: r.link!,
        title: r.title!,
        snippet: r.snippet ?? "",
        publishedAt: r.date,
        dateSource: r.date ? "provider" : "unknown",
        publisher: r.source,
        imageUrl: r.imageUrl,
        provider: this.name,
      }));
  }
}
