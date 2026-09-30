import type { Category, DateSource, Lang } from "../types";
import type { Window } from "../util/dates";

export type TaskKind = "web" | "news" | "openalex" | "arxiv";

export interface SearchTask {
  id: string;
  kind: TaskKind;
  category: Category;
  query: string;
  lang: Lang;
  includeDomains?: string[];
  /** OpenAlex filter expression (without the date filter, which is added automatically). */
  openalexFilter?: string;
  /** Personal signal attached to every result of this task (e.g. "cites-your-work"). */
  signal?: string;
  priority: number;
}

export interface RawResult {
  url: string;
  title: string;
  snippet: string;
  content?: string;
  publishedAt?: string;
  dateSource: DateSource;
  publisher?: string;
  provider: string;
  authors?: string[];
  venue?: string;
  doi?: string;
  imageUrl?: string;
  signals?: string[];
  lang?: Lang;
}

export interface SearchContext {
  window: Window;
  maxResults: number;
}

export interface SearchProvider {
  readonly name: string;
  search(task: SearchTask, ctx: SearchContext): Promise<RawResult[]>;
}

export class ProviderError extends Error {
  constructor(
    readonly provider: string,
    message: string,
    /** Auth/quota failures disable the provider for the rest of the run. */
    readonly fatal = false,
  ) {
    super(`${provider}: ${message}`);
    this.name = "ProviderError";
  }
}

export const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";

export async function httpJson<T>(
  provider: string,
  url: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<T> {
  const { timeoutMs = 20000, ...rest } = init;
  let res: Response;
  try {
    res = await fetch(url, { ...rest, signal: AbortSignal.timeout(timeoutMs) });
  } catch (e) {
    throw new ProviderError(provider, e instanceof Error ? e.message : String(e));
  }
  const text = await res.text();
  if (!res.ok) {
    const fatal = res.status === 401 || res.status === 402 || res.status === 403 || res.status === 432 || res.status === 433;
    throw new ProviderError(provider, `HTTP ${res.status} ${text.slice(0, 200)}`, fatal);
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ProviderError(provider, "invalid JSON response");
  }
}

export async function httpText(
  provider: string,
  url: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<string> {
  const { timeoutMs = 20000, ...rest } = init;
  let res: Response;
  try {
    res = await fetch(url, {
      ...rest,
      headers: { "User-Agent": USER_AGENT, ...(rest.headers ?? {}) },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    throw new ProviderError(provider, e instanceof Error ? e.message : String(e));
  }
  if (!res.ok) throw new ProviderError(provider, `HTTP ${res.status}`, res.status === 403 || res.status === 429);
  return res.text();
}

/** Append a site restriction for engines that support `site:` operators. */
export function withSiteFilter(query: string, domains?: string[]): string {
  if (!domains?.length) return query;
  const sites = domains.map((d) => `site:${d}`).join(" OR ");
  return domains.length === 1 ? `${query} ${sites}` : `${query} (${sites})`;
}
