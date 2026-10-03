import type { Category, DateSource, Lang } from "../types";
import type { Window } from "../util/dates";

export type TaskKind = "web" | "news" | "s2" | "europepmc" | "arxiv" | "scholar" | "feed";

/** What a Semantic Scholar task fetches. */
export type S2Request =
  | { mode: "search" }
  | { mode: "author"; authorId: string }
  | { mode: "citations"; paperId: string }
  | { mode: "recommend"; positive: string[]; negative: string[] };

export interface SearchTask {
  id: string;
  kind: TaskKind;
  category: Category;
  query: string;
  lang: Lang;
  includeDomains?: string[];
  /** Semantic Scholar request (defaults to keyword search). */
  s2?: S2Request;
  /** Google Scholar: list papers citing this citation cluster id instead of searching. */
  scholarCites?: string;
  /** Watchlist RSS/Atom feed to read. */
  feedUrl?: string;
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
  /** Semantic Scholar paper id, when known. */
  paperId?: string;
}

export interface SearchContext {
  window: Window;
  maxResults: number;
}

export interface SearchProvider {
  readonly name: string;
  /** Minimum spacing between requests to this provider (rate limits), applied outside MOCK_MODE. */
  readonly minIntervalMs?: number;
  search(task: SearchTask, ctx: SearchContext): Promise<RawResult[]>;
}

export interface ProviderErrorDetail {
  /** How long the service asked us to wait (Retry-After), in milliseconds. */
  retryAfterMs?: number;
  /** The request ran out of time instead of getting an answer. */
  timedOut?: boolean;
}

export class ProviderError extends Error {
  readonly retryAfterMs?: number;
  readonly timedOut: boolean;
  constructor(
    readonly provider: string,
    message: string,
    /** Auth/quota failures disable the provider for the rest of the run. */
    readonly fatal = false,
    readonly status?: number,
    detail: ProviderErrorDetail = {},
  ) {
    super(`${provider}: ${message}`);
    this.name = "ProviderError";
    this.retryAfterMs = detail.retryAfterMs;
    this.timedOut = detail.timedOut ?? false;
  }
}

/** Retry-After as milliseconds: a number of seconds or an HTTP date. */
export function retryAfterMs(res: Pick<Response, "headers">): number | undefined {
  const v = res.headers.get("retry-after");
  if (!v) return undefined;
  const seconds = Number(v);
  if (Number.isFinite(seconds)) return Math.max(0, seconds) * 1000;
  const at = Date.parse(v);
  return Number.isNaN(at) ? undefined : Math.max(0, at - Date.now());
}

const isTimeout = (e: unknown) => e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");

/**
 * Whether a failure says the service itself is struggling (rate limit, outage, no answer) rather than
 * that one request was wrong. Only these count toward switching a provider off for the run.
 */
export function isOutage(e: unknown): boolean {
  if (e instanceof ProviderError && e.status !== undefined) return e.status === 429 || e.status >= 500;
  return true;
}

/** A few words for the run log: "was rate-limited (HTTP 429)", "timed out", … */
export function describeFailure(e: unknown): string {
  if (e instanceof ProviderError) {
    if (e.timedOut) return "timed out";
    if (e.status === 429) return "was rate-limited (HTTP 429)";
    if (e.status !== undefined && e.status >= 500) return `was unavailable (HTTP ${e.status})`;
    if (e.status !== undefined) return `answered HTTP ${e.status}`;
  }
  const msg = (e instanceof Error ? e.message : String(e)).replace(/^[\w-]+: /, "").replace(/\s+/g, " ").trim();
  return `failed (${msg.length > 80 ? `${msg.slice(0, 79)}…` : msg})`;
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
    throw new ProviderError(provider, e instanceof Error ? e.message : String(e), false, undefined, { timedOut: isTimeout(e) });
  }
  const text = await res.text();
  if (!res.ok) {
    const fatal = res.status === 401 || res.status === 402 || res.status === 403 || res.status === 432 || res.status === 433;
    // A rate limit's body is boilerplate; other errors keep the start of theirs.
    const detail = res.status === 429 ? "" : ` ${text.slice(0, 200)}`;
    throw new ProviderError(provider, `HTTP ${res.status}${detail}`.trim(), fatal, res.status, { retryAfterMs: retryAfterMs(res) });
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
    throw new ProviderError(provider, e instanceof Error ? e.message : String(e), false, undefined, { timedOut: isTimeout(e) });
  }
  if (!res.ok) {
    throw new ProviderError(provider, `HTTP ${res.status}`, res.status === 403 || res.status === 429, res.status, { retryAfterMs: retryAfterMs(res) });
  }
  return res.text();
}

/** Append a site restriction for engines that support `site:` operators. */
export function withSiteFilter(query: string, domains?: string[]): string {
  if (!domains?.length) return query;
  const sites = domains.map((d) => `site:${d}`).join(" OR ");
  return domains.length === 1 ? `${query} ${sites}` : `${query} (${sites})`;
}
