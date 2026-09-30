import { truncate } from "../util/text";
import { httpJson, type RawResult, type SearchContext, type SearchProvider, type SearchTask } from "./types";

interface ExaResponse {
  results?: {
    title?: string | null;
    url?: string;
    publishedDate?: string | null;
    author?: string | null;
    text?: string;
    image?: string;
  }[];
}

/** Exa neural search (https://exa.ai) with published-date filtering and inline page text. */
export class ExaProvider implements SearchProvider {
  readonly name = "exa";
  constructor(private readonly apiKey: string) {}

  async search(task: SearchTask, ctx: SearchContext): Promise<RawResult[]> {
    const body: Record<string, unknown> = {
      query: task.query,
      type: "auto",
      numResults: Math.min(ctx.maxResults, 20),
      startPublishedDate: ctx.window.start.toISOString(),
      endPublishedDate: ctx.window.end.toISOString(),
      contents: { text: { maxCharacters: 8000 } },
    };
    if (task.kind === "news") body.category = "news";
    else if (task.category === "paper") body.category = "research paper";
    if (task.includeDomains?.length) body.includeDomains = task.includeDomains;
    const data = await httpJson<ExaResponse>(this.name, "https://api.exa.ai/search", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": this.apiKey },
      body: JSON.stringify(body),
      timeoutMs: 30000,
    });
    return (data.results ?? [])
      .filter((r) => r.url)
      .map((r) => ({
        url: r.url!,
        title: r.title || r.url!,
        snippet: truncate(r.text ?? "", 600),
        content: r.text ? truncate(r.text, 9000) : undefined,
        publishedAt: r.publishedDate ?? undefined,
        dateSource: r.publishedDate ? "provider" : "unknown",
        authors: r.author ? [r.author] : undefined,
        imageUrl: r.image,
        provider: this.name,
      }));
  }
}
