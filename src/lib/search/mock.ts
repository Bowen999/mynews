import { MOCK_CORPUS } from "../mock/corpus";
import { tokenize } from "../util/text";
import type { RawResult, SearchContext, SearchProvider, SearchTask } from "./types";

/** Offline search over the fictional sample corpus (MOCK_MODE only). */
export class MockSearchProvider implements SearchProvider {
  readonly name = "mock";

  async search(task: SearchTask, ctx: SearchContext): Promise<RawResult[]> {
    const q = new Set(tokenize(task.query));
    const pool = MOCK_CORPUS.filter((d) => {
      if (task.signal) return d.signals?.includes(task.signal);
      if (task.kind === "openalex" || task.kind === "arxiv") return d.category === "paper";
      return d.category === task.category || (task.category === "news" && d.category !== "paper");
    });
    const ranked = pool
      .map((d) => ({ d, hits: tokenize(`${d.title} ${d.content}`).filter((t) => q.has(t)).length }))
      .sort((a, b) => b.hits - a.hits)
      .slice(0, Math.min(ctx.maxResults, 5));
    return ranked.map(({ d }) => ({
      url: d.url,
      title: d.title,
      snippet: d.content.slice(0, 280),
      content: d.content,
      publishedAt: new Date(ctx.window.end.getTime() - d.daysAgo * 86400000).toISOString(),
      dateSource: "metadata",
      publisher: d.publisher,
      authors: d.authors,
      venue: d.venue,
      signals: d.signals,
      provider: this.name,
    }));
  }
}
