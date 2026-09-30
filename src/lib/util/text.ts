import { createHash, randomUUID } from "node:crypto";

export function sha1(input: string): string {
  return createHash("sha1").update(input).digest("hex");
}

export function shortHash(input: string, len = 12): string {
  return sha1(input).slice(0, len);
}

export function newId(prefix = ""): string {
  const id = randomUUID().replace(/-/g, "").slice(0, 16);
  return prefix ? `${prefix}_${id}` : id;
}

export function truncate(text: string, max: number): string {
  if (!text) return "";
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastBreak = Math.max(cut.lastIndexOf("\n"), cut.lastIndexOf(". "), cut.lastIndexOf("。"));
  return (lastBreak > max * 0.6 ? cut.slice(0, lastBreak + 1) : cut).trimEnd() + " …";
}

export function collapseWhitespace(text: string): string {
  return text
    .replace(/\r/g, "")
    .replace(/[ \t ]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const HTML_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  "#39": "'",
  hellip: "…",
  mdash: "—",
  ndash: "–",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
};

export function decodeEntities(text: string): string {
  return text.replace(/&(#x?[0-9a-f]+|[a-z]+[0-9]*);/gi, (m, code: string) => {
    const lower = code.toLowerCase();
    if (lower.startsWith("#x")) return String.fromCodePoint(parseInt(lower.slice(2), 16));
    if (lower.startsWith("#")) return String.fromCodePoint(parseInt(lower.slice(1), 10));
    return HTML_ENTITIES[lower] ?? m;
  });
}

export function stripTags(html: string): string {
  return collapseWhitespace(decodeEntities(html.replace(/<[^>]+>/g, " ")));
}

const CJK = /[㐀-鿿豈-﫿]/;

export function hasCJK(text: string): boolean {
  return CJK.test(text);
}

const STOPWORDS = new Set(
  "a an and are as at be by for from has have in into is it its of on or that the this to was were will with via new using based towards toward study analysis we our their not can than".split(
    " ",
  ),
);

/** Lower-cased word tokens (Latin) plus CJK bigrams, without stopwords. */
export function tokenize(text: string): string[] {
  const lower = text.toLowerCase();
  const words = lower.match(/[\p{L}\p{N}][\p{L}\p{N}\-+.]*/gu) ?? [];
  const out: string[] = [];
  for (const w of words) {
    if (CJK.test(w)) {
      const chars = [...w].filter((c) => CJK.test(c));
      for (let i = 0; i < chars.length - 1; i++) out.push(chars[i] + chars[i + 1]);
      if (chars.length === 1) out.push(chars[0]);
    } else {
      const clean = w.replace(/[.\-+]+$/, "");
      if (clean.length > 1 && !STOPWORDS.has(clean)) out.push(clean);
    }
  }
  return out;
}

export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/\s+[-|–—:]\s+[^-|–—:]{2,40}$/, "") // strip trailing " - Publisher"
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** Jaccard similarity between token sets. */
export function jaccard(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0;
  const sa = new Set(a);
  const sb = new Set(b);
  let inter = 0;
  for (const t of sa) if (sb.has(t)) inter++;
  return inter / (sa.size + sb.size - inter);
}

export function titleSimilarity(a: string, b: string): number {
  return jaccard(tokenize(normalizeTitle(a)), tokenize(normalizeTitle(b)));
}

export function uniq<T>(arr: T[]): T[] {
  return [...new Set(arr)];
}

export function uniqBy<T>(arr: T[], key: (t: T) => string): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of arr) {
    const k = key(item);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(item);
  }
  return out;
}

export function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}
