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
import { describeFailure, isOutage, ProviderError, type RawResult, type SearchContext, type SearchProvider, type SearchTask, type TaskKind } from "./types";

export type { RawResult, SearchTask } from "./types";

export type Routing = Record<TaskKind, SearchProvider[]>;

/** After this many outages in a row (rate limit, timeout, 5xx) a provider is skipped for the rest of the run. */
export const TRIP_AFTER = 2;

const LABELS: Record<string, string> = {
  "semantic-scholar": "Semantic Scholar",
  "europe-pmc": "Europe PMC",
  arxiv: "arXiv",
  "google-scholar": "Google Scholar",
  tavily: "Tavily",
  exa: "Exa",
  serper: "Serper",
  brave: "Brave Search",
};

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

/** How one provider fared in a run; listed only when something went wrong. */
export interface ProviderHealth {
  provider: string;
  ok: number;
  /** Requests that failed. */
  failed: number;
  /** Requests never sent because the provider had been switched off for the run. */
  skipped: number;
  /** The last failure, in a few words ("timed out"). */
  reason?: string;
}

export interface SearchOutcome {
  results: TaggedResult[];
  tasksRun: number;
  providersUsed: string[];
  errors: string[];
  health: ProviderHealth[];
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** One line for the run log: "arXiv timed out: 2 requests failed, 3 skipped." */
export function describeHealth(h: ProviderHealth): string {
  const counts = [h.failed ? `${plural(h.failed, "request")} failed` : "", h.skipped ? `${h.skipped} skipped` : ""].filter(Boolean).join(", ");
  return `${LABELS[h.provider] ?? h.provider} ${h.reason ?? "had problems"}: ${counts}.`;
}

/**
 * Run all tasks with bounded concurrency, falling back across providers. A provider is switched off for
 * the rest of the run when it fails fatally (bad key, quota) or has TRIP_AFTER outages in a row, so a
 * rate-limited or unreachable service doesn't spend the whole stage on requests that cannot succeed.
 */
export async function runSearchTasks(
  tasks: SearchTask[],
  ctx: SearchContext,
  opts: { deadlineMs: number; onProgress?: (done: number, total: number) => void; routing?: Routing },
): Promise<SearchOutcome> {
  const routing = opts.routing ?? buildRouting();
  const disabled = new Set<string>();
  const used = new Set<string>();
  const errors: string[] = [];
  const started = Date.now();
  const nextSlot = new Map<string, number>();
  const tally = new Map<string, ProviderHealth & { streak: number }>();
  const tallyOf = (provider: string) => {
    let t = tally.get(provider);
    if (!t) tally.set(provider, (t = { provider, ok: 0, failed: 0, skipped: 0, streak: 0 }));
    return t;
  };
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
    const configured = routing[task.kind];
    const chain = configured.filter((p) => !disabled.has(p.name));
    if (!chain.length && configured.length) tallyOf(configured[0].name).skipped++;
    for (const provider of chain) {
      try {
        await pace(provider);
        if (disabled.has(provider.name)) continue; // switched off while this task waited for its slot
        if (Date.now() - started > opts.deadlineMs) return [];
        const results = await provider.search(task, ctx);
        used.add(provider.name);
        const t = tallyOf(provider.name);
        t.ok++;
        t.streak = 0;
        return results.map((r) => ({
          ...r,
          lang: r.lang ?? task.lang,
          signals: [...(r.signals ?? []), ...(task.signal && !r.signals?.includes(task.signal) ? [task.signal] : [])],
        }));
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (errors.length < 30 && !disabled.has(provider.name)) errors.push(`[${task.kind}] ${msg}`);
        const t = tallyOf(provider.name);
        t.failed++;
        t.reason = describeFailure(e);
        if (isOutage(e)) t.streak++;
        if ((e instanceof ProviderError && e.fatal) || t.streak >= TRIP_AFTER) disabled.add(provider.name);
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

  const health = [...tally.values()]
    .filter((t) => t.failed || t.skipped)
    .map(({ provider, ok, failed, skipped, reason }): ProviderHealth => ({ provider, ok, failed, skipped, reason }));
  return { results: batches.flat(2), tasksRun: tasks.length, providersUsed: [...used], errors, health };
}

export { TavilyProvider };
