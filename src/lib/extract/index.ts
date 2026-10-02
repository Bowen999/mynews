import { config } from "../config";
import { USER_AGENT } from "../search/types";
import { isPublicHttpUrl } from "../util/url";
import { extractFromHtml, type ExtractedPage } from "./html";

const MAX_BYTES = 3_000_000;

export interface FetchedPage {
  finalUrl: string;
  status: number;
  contentType: string;
  body: string;
}

export async function fetchPage(url: string, timeoutMs = 12000): Promise<FetchedPage> {
  if (!isPublicHttpUrl(url)) throw new Error("refusing to fetch a non-public URL");
  const res = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9,zh-CN;q=0.8",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(timeoutMs),
  });
  const contentType = res.headers.get("content-type") ?? "";
  if (res.url && !isPublicHttpUrl(res.url)) throw new Error("redirected to a non-public URL");
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  if (!/html|xml|text\/plain/i.test(contentType)) throw new Error(`unsupported content-type ${contentType || "unknown"}`);
  const reader = res.body?.getReader();
  if (!reader) return { finalUrl: res.url || url, status: res.status, contentType, body: await res.text() };
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    chunks.push(value);
    if (size > MAX_BYTES) {
      await reader.cancel();
      break;
    }
  }
  const buf = Buffer.concat(chunks.map((c) => Buffer.from(c)));
  const charset = /charset=([\w-]+)/i.exec(contentType)?.[1]?.toLowerCase();
  let body: string;
  try {
    body = new TextDecoder(charset && charset !== "utf8" ? charset : "utf-8").decode(buf);
  } catch {
    body = buf.toString("utf8");
  }
  return { finalUrl: res.url || url, status: res.status, contentType, body };
}

interface JinaResponse {
  data?: { title?: string; content?: string; text?: string; html?: string; description?: string; publishedTime?: string; url?: string };
}

function jinaHeaders(format: "text" | "html"): Record<string, string> {
  const headers: Record<string, string> = { Accept: "application/json", "X-Return-Format": format };
  if (config.search.jinaKey) headers.Authorization = `Bearer ${config.search.jinaKey}`;
  return headers;
}

/** Jina Reader (r.jina.ai) renders JS-heavy or bot-protected pages into text. */
export async function jinaRead(url: string, timeoutMs = 25000): Promise<ExtractedPage> {
  if (!isPublicHttpUrl(url)) throw new Error("refusing to fetch a non-public URL");
  const res = await fetch(`https://r.jina.ai/${url}`, { headers: jinaHeaders("text"), signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`jina HTTP ${res.status}`);
  const json = (await res.json()) as JinaResponse;
  const d = json.data ?? {};
  return {
    title: d.title,
    text: d.text ?? d.content ?? "",
    description: d.description,
    publishedAt: d.publishedTime,
    dateSource: d.publishedTime ? "metadata" : "unknown",
  };
}

/** Rendered HTML of a page through Jina Reader (used for Google Scholar, which blocks most servers). */
export async function jinaHtml(url: string, timeoutMs = 30000): Promise<string> {
  if (!isPublicHttpUrl(url)) throw new Error("refusing to fetch a non-public URL");
  const res = await fetch(`https://r.jina.ai/${url}`, { headers: jinaHeaders("html"), signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`jina HTTP ${res.status}`);
  const json = (await res.json()) as JinaResponse;
  return json.data?.html ?? json.data?.content ?? json.data?.text ?? "";
}

export interface ExtractOptions {
  allowJina: boolean;
  timeoutMs?: number;
}

export interface ExtractResult extends ExtractedPage {
  via: "direct" | "jina";
  finalUrl: string;
  html?: string;
}

/** Fetch and extract a page directly, falling back to Jina Reader for thin or blocked pages. */
export async function extractUrl(url: string, opts: ExtractOptions): Promise<ExtractResult> {
  let directError: string | undefined;
  let thin: ExtractResult | undefined;
  try {
    const page = await fetchPage(url, opts.timeoutMs);
    const extracted = extractFromHtml(page.body, page.finalUrl);
    const result: ExtractResult = { ...extracted, via: "direct", finalUrl: page.finalUrl, html: page.body };
    if (extracted.text.length >= 400 || !opts.allowJina) return result;
    thin = result;
    directError = "thin content";
  } catch (e) {
    directError = e instanceof Error ? e.message : String(e);
  }
  if (!opts.allowJina) throw new Error(directError);
  try {
    const viaJina = await jinaRead(url);
    if (viaJina.text && viaJina.text.length >= 100) {
      // Keep metadata the direct fetch found (dates, images) when Jina lacks it.
      return {
        ...viaJina,
        publishedAt: viaJina.publishedAt ?? thin?.publishedAt,
        dateSource: viaJina.publishedAt ? viaJina.dateSource : (thin?.dateSource ?? "unknown"),
        imageUrl: thin?.imageUrl,
        siteName: thin?.siteName,
        via: "jina",
        finalUrl: url,
      };
    }
  } catch (e) {
    if (!thin) throw new Error(`${directError}; ${e instanceof Error ? e.message : String(e)}`);
  }
  if (thin) return thin;
  throw new Error(`no readable content (${directError})`);
}
