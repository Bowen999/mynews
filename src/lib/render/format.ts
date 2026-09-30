import { CATEGORY_META, type Category, type DateSource } from "../types";

export type Token = { type: "text"; value: string } | { type: "cite"; id: string } | { type: "itemref"; n: number };

/** Split prose into text and citation tokens ([S1] → cite, [3] → reference to item 3). */
export function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  const re = /\[(S\d+)\]|\[(\d{1,2})\]/g;
  let last = 0;
  for (const m of text.matchAll(re)) {
    const idx = m.index ?? 0;
    if (idx > last) tokens.push({ type: "text", value: text.slice(last, idx) });
    if (m[1]) tokens.push({ type: "cite", id: m[1] });
    else tokens.push({ type: "itemref", n: Number(m[2]) });
    last = idx + m[0].length;
  }
  if (last < text.length) tokens.push({ type: "text", value: text.slice(last) });
  // Citations attach to the preceding word: "growth [S1]." → "growth¹."
  for (let i = 0; i < tokens.length - 1; i++) {
    const t = tokens[i];
    if (t.type === "text" && tokens[i + 1].type === "cite") t.value = t.value.replace(/\s+$/, "");
  }
  return tokens;
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export function categoryLabel(c: Category): string {
  return CATEGORY_META[c]?.label ?? c;
}

export function dateNote(source: DateSource): string {
  switch (source) {
    case "metadata":
      return "Date from page metadata";
    case "page":
      return "Date shown on page";
    case "provider":
      return "Date per search index";
    default:
      return "Publication date not stated; found by a past-7-days search";
  }
}

export function scoreRows(scores: { relevance: number; impact: number; novelty: number; credibility: number; value: number }) {
  return [
    { key: "relevance", label: "Relevance", value: scores.relevance },
    { key: "impact", label: "Impact", value: scores.impact },
    { key: "novelty", label: "Novelty", value: scores.novelty },
    { key: "credibility", label: "Credibility", value: scores.credibility },
    { key: "value", label: "Value to you", value: scores.value },
  ];
}

export function sourceNumber(id: string): string {
  return id.replace(/^S/, "");
}
