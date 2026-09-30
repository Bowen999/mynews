import { config } from "../config";
import { pMap } from "../util/concurrency";
import { ArxivProvider } from "./arxiv";
import { BraveProvider } from "./brave";
import { ExaProvider } from "./exa";
import { MockSearchProvider } from "./mock";
import { OpenAlexProvider } from "./openalex";
import { BingNewsRssProvider, BingWebRssProvider, GoogleNewsRssProvider } from "./rss";
import { SerperProvider } from "./serper";
import { TavilyProvider } from "./tavily";
import type { Category } from "../types";
import { ProviderError, type RawResult, type SearchContext, type SearchProvider, type SearchTask, type TaskKind } from "./types";

export type { RawResult, SearchTask } from "./types";

interface Routing {
  web: SearchProvider[];
  news: SearchProvider[];
  openalex: SearchProvider[];
  arxiv: SearchProvider[];
}

function apiProviders(): SearchProvider[] {
  const list: SearchProvider[] = [];
  if (config.search.tavilyKey) list.push(new TavilyProvider(config.search.tavilyKey));
  if (config.search.exaKey) list.push(new ExaProvider(config.search.exaKey));
  if (config.search.serperKey) list.push(new SerperProvider(config.search.serperKey));
  if (config.search.braveKey) list.push(new BraveProvider(config.search.braveKey));
  return list;
}

/**
 * Providers are tried in order for each task; the first one that succeeds wins. Keyed APIs come
 * first; keyless RSS feeds are the last resort.
 */
export function buildRouting(): Routing {
  if (config.mockMode) {
    const mock = new MockSearchProvider();
    return { web: [mock], news: [mock], openalex: [mock], arxiv: [mock] };
  }
  const api = apiProviders();
  const rss = config.search.rssFallback;
  return {
    web: [...api, ...(rss ? [new BingWebRssProvider()] : [])],
    news: [...api, ...(rss ? [new BingNewsRssProvider(), new GoogleNewsRssProvider()] : [])],
    openalex: [new OpenAlexProvider()],
    arxiv: [new ArxivProvider()],
  };
}

export interface TaggedResult extends RawResult {
  category: Category;
  query: string;
  taskKind: TaskKind;
}

export interface SearchOutcome {
  results: TaggedResult[];
  tasksRun: number;
  providersUsed: string[];
  errors: string[];
}

/** Run all tasks with bounded concurrency, falling back across providers and disabling ones that fail fatally. */
export async function runSearchTasks(
  tasks: SearchTask[],
  ctx: SearchContext,
  opts: { deadlineMs: number; onProgress?: (done: number, total: number) => void },
): Promise<SearchOutcome> {
  const routing = buildRouting();
  const disabled = new Set<string>();
  const used = new Set<string>();
  const errors: string[] = [];
  const started = Date.now();
  let done = 0;
  let arxivChain = Promise.resolve();

  const perTask = async (task: SearchTask): Promise<RawResult[]> => {
    if (Date.now() - started > opts.deadlineMs) return [];
    const chain = routing[task.kind].filter((p) => !disabled.has(p.name));
    for (const provider of chain) {
      try {
        let results: RawResult[];
        if (provider.name === "arxiv") {
          // arXiv asks clients to space requests ~3s apart.
          const run = arxivChain.then(() => provider.search(task, ctx));
          arxivChain = run.then(
            () => new Promise((r) => setTimeout(r, 3000)),
            () => new Promise((r) => setTimeout(r, 3000)),
          );
          results = await run;
        } else {
          results = await provider.search(task, ctx);
        }
        used.add(provider.name);
        return results.map((r) => ({
          ...r,
          lang: r.lang ?? task.lang,
          signals: [...(r.signals ?? []), ...(task.signal && !r.signals?.includes(task.signal) ? [task.signal] : [])],
        }));
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (errors.length < 30) errors.push(`[${task.kind}] ${msg}`);
        if (e instanceof ProviderError && e.fatal) disabled.add(provider.name);
      }
    }
    return [];
  };

  const batches = await pMap(
    tasks,
    async (t) => {
      const r = await perTask(t);
      done++;
      opts.onProgress?.(done, tasks.length);
      return r.map((x): TaggedResult => ({ ...x, category: t.category, query: t.query, taskKind: t.kind }));
    },
    6,
  );

  return { results: batches.flat(), tasksRun: tasks.length, providersUsed: [...used], errors };
}

export { TavilyProvider };
