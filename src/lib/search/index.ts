import { config } from "../config";
import { pMap } from "../util/concurrency";
import { ArxivProvider } from "./arxiv";
import { BraveProvider } from "./brave";
import { EuropePmcProvider } from "./europepmc";
import { ExaProvider } from "./exa";
import { FeedProvider } from "./feeds";
import { MockSearchProvider } from "./mock";
import { BingNewsRssProvider, BingWebRssProvider, GoogleNewsRssProvider } from "./rss";
import { GoogleScholarProvider } from "./scholar";
import { SemanticScholarProvider } from "./semanticscholar";
import { SerperProvider } from "./serper";
import { TavilyProvider } from "./tavily";
import type { Category } from "../types";
import { ProviderError, type RawResult, type SearchContext, type SearchProvider, type SearchTask, type TaskKind } from "./types";

export type { RawResult, SearchTask } from "./types";

type Routing = Record<TaskKind, SearchProvider[]>;

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
    return { web: [mock], news: [mock], s2: [mock], europepmc: [mock], arxiv: [mock], scholar: [mock], feed: [mock] };
  }
  const api = apiProviders();
  const rss = config.search.rssFallback;
  return {
    web: [...api, ...(rss ? [new BingWebRssProvider()] : [])],
    news: [...api, ...(rss ? [new BingNewsRssProvider(), new GoogleNewsRssProvider()] : [])],
    s2: [new SemanticScholarProvider()],
    europepmc: [new EuropePmcProvider()],
    arxiv: [new ArxivProvider()],
    scholar: config.search.googleScholar ? [new GoogleScholarProvider()] : [],
    feed: [new FeedProvider()],
  };
}

/** Tasks run in lanes so one rate-limited service (arXiv, Semantic Scholar, Scholar) never stalls the others. */
const LANES: Record<TaskKind, { lane: string; concurrency: number }> = {
  web: { lane: "web", concurrency: 6 },
  news: { lane: "web", concurrency: 6 },
  s2: { lane: "s2", concurrency: 1 },
  europepmc: { lane: "europepmc", concurrency: 3 },
  arxiv: { lane: "arxiv", concurrency: 1 },
  scholar: { lane: "scholar", concurrency: 1 },
  feed: { lane: "feed", concurrency: 4 },
};

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
  const nextSlot = new Map<string, number>();
  let done = 0;

  /** Wait for the provider's next free slot (requests in a lane run one at a time when spacing applies). */
  const pace = async (provider: SearchProvider) => {
    const gap = config.mockMode ? 0 : (provider.minIntervalMs ?? 0);
    if (!gap) return;
    const now = Date.now();
    const at = Math.max(now, nextSlot.get(provider.name) ?? 0);
    nextSlot.set(provider.name, at + gap);
    if (at > now) await new Promise((r) => setTimeout(r, at - now));
  };

  const perTask = async (task: SearchTask): Promise<RawResult[]> => {
    if (Date.now() - started > opts.deadlineMs) return [];
    const chain = routing[task.kind].filter((p) => !disabled.has(p.name));
    for (const provider of chain) {
      try {
        await pace(provider);
        if (Date.now() - started > opts.deadlineMs) return [];
        const results = await provider.search(task, ctx);
        used.add(provider.name);
        return results.map((r) => ({
          ...r,
          lang: r.lang ?? task.lang,
          signals: [...(r.signals ?? []), ...(task.signal && !r.signals?.includes(task.signal) ? [task.signal] : [])],
        }));
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (errors.length < 30 && !disabled.has(provider.name)) errors.push(`[${task.kind}] ${msg}`);
        if (e instanceof ProviderError && e.fatal) disabled.add(provider.name);
      }
    }
    return [];
  };

  const lanes = new Map<string, SearchTask[]>();
  for (const t of tasks) {
    const { lane } = LANES[t.kind];
    lanes.set(lane, [...(lanes.get(lane) ?? []), t]);
  }
  const batches = await Promise.all(
    [...lanes.values()].map((laneTasks) =>
      pMap(
        laneTasks,
        async (t) => {
          const r = await perTask(t);
          done++;
          opts.onProgress?.(done, tasks.length);
          return r.map((x): TaggedResult => ({ ...x, category: t.category, query: t.query, taskKind: t.kind }));
        },
        LANES[laneTasks[0].kind].concurrency,
      ),
    ),
  );

  return { results: batches.flat(2), tasksRun: tasks.length, providersUsed: [...used], errors };
}

export { TavilyProvider };
