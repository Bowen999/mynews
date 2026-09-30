/**
 * Guards against unsupported claims in model output:
 *  - citation markers must reference real sources for the item;
 *  - numbers in a claim must appear in the cited sources' text;
 *  - facts and analysis paragraphs without any valid citation are removed.
 */

const MARKER_RE = /\[\s*(S\d+(?:\s*[,;，]\s*S?\d+)*)\s*\]/gi;

export function citedIds(text: string): string[] {
  const ids: string[] = [];
  for (const m of text.matchAll(MARKER_RE)) {
    for (const part of m[1].split(/[,;，]/)) {
      const id = part.trim().toUpperCase();
      ids.push(id.startsWith("S") ? id : `S${id}`);
    }
  }
  return [...new Set(ids)];
}

/** Normalize "[S1, S2]" to "[S1][S2]" and remove references to unknown sources. */
export function cleanMarkers(text: string, valid: Set<string>): string {
  return text
    .replace(MARKER_RE, (_m, inner: string) => {
      const ids = inner
        .split(/[,;，]/)
        .map((p) => p.trim().toUpperCase())
        .map((p) => (p.startsWith("S") ? p : `S${p}`))
        .filter((id) => valid.has(id));
      return [...new Set(ids)].map((id) => `[${id}]`).join("");
    })
    .replace(/\s+([.,;:!?。，；：])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function stripMarkers(text: string): string {
  return text.replace(MARKER_RE, "").replace(/\s+([.,;:!?。，；：])/g, "$1").replace(/\s{2,}/g, " ").trim();
}

const UNIT_AFTER = /^\s*(%|percent|per\s?cent|million|billion|trillion|thousand|bn|m\b|k\b|万|亿|千|百万|美元|元|人|篇|项|家|倍|x\b)/i;
const CURRENCY_BEFORE = /[$€£¥￥]\s*$/;

/** Numeric tokens that should be verifiable: amounts, percentages, years and any number ≥ 10. */
export function claimNumbers(text: string): string[] {
  const clean = stripMarkers(text);
  const out: string[] = [];
  for (const m of clean.matchAll(/\d[\d,]*(?:\.\d+)?/g)) {
    const raw = m[0].replace(/[,.]$/, "");
    const value = raw.replace(/,/g, "");
    const idx = m.index ?? 0;
    const before = clean.slice(Math.max(0, idx - 2), idx);
    const after = clean.slice(idx + m[0].length, idx + m[0].length + 12);
    // Skip parts of identifiers/versions like "GPT-4", "COVID-19", "H100", "v2".
    if (/[A-Za-z]-?$/.test(before) && !CURRENCY_BEFORE.test(before)) continue;
    const hasUnit = UNIT_AFTER.test(after) || CURRENCY_BEFORE.test(before);
    const num = Number(value);
    if (!hasUnit && Number.isFinite(num) && num < 10 && !value.includes(".")) continue;
    out.push(value);
  }
  return [...new Set(out)];
}

export function normalizeHaystack(text: string): string {
  return text.replace(/(\d),(\d)/g, "$1$2").replace(/\s+/g, " ");
}

export function numberSupported(value: string, haystack: string): boolean {
  if (haystack.includes(value)) return true;
  // Accept "1.50" vs "1.5" and "2,000" vs "2000" (haystack is comma-normalized).
  if (value.includes(".")) {
    const trimmed = value.replace(/0+$/, "").replace(/\.$/, "");
    if (haystack.includes(trimmed)) return true;
  }
  return false;
}

const ABBREVIATION = /(?:^|[\s(.])(?:[A-Z]|Dr|Prof|Mr|Ms|Mrs|St|vs|etc|al|Inc|Ltd|Co|Corp|No|Fig|Eq|e\.g|i\.e|approx)$/;

/** Split prose into sentences, keeping trailing citation markers with their sentence. */
export function splitSentences(text: string): string[] {
  const out: string[] = [];
  let last = 0;
  for (const m of text.matchAll(/[.!?。！？]+(?:\s*\[S\d+\])*/g)) {
    const end = (m.index ?? 0) + m[0].length;
    const next = text.slice(end);
    const cjk = /[。！？]/.test(m[0]);
    if (!cjk) {
      if (next && !/^\s+\S/.test(next)) continue; // decimals, URLs, "3.5"
      if (m[0].startsWith(".") && ABBREVIATION.test(text.slice(last, m.index))) continue;
    }
    const sentence = text.slice(last, end).trim();
    if (sentence) out.push(sentence);
    last = end;
  }
  const tail = text.slice(last).trim();
  if (tail) out.push(tail);
  return out;
}

export interface VerifyReport {
  checked: number;
  removed: number;
  notes: string[];
}

export class ClaimVerifier {
  readonly report: VerifyReport = { checked: 0, removed: 0, notes: [] };
  private readonly valid: Set<string>;

  constructor(private readonly sourceTexts: Map<string, string>) {
    this.valid = new Set(sourceTexts.keys());
  }

  private haystack(ids: string[]): string {
    const use = ids.length ? ids : [...this.valid];
    return normalizeHaystack(use.map((id) => this.sourceTexts.get(id) ?? "").join("\n"));
  }

  private unsupportedNumbers(text: string, ids: string[]): string[] {
    const hay = this.haystack(ids);
    return claimNumbers(text).filter((n) => !numberSupported(n, hay));
  }

  /** Keep sentences whose numbers are supported by the sources they (or their paragraph) cite. */
  cleanProse(text: string, opts: { requireCitation: boolean; label: string }): string {
    const cleaned = cleanMarkers(text, this.valid);
    const paragraphIds = citedIds(cleaned);
    if (opts.requireCitation && !paragraphIds.length) {
      this.report.checked++;
      this.report.removed++;
      this.report.notes.push(`Removed ${opts.label} without source citations.`);
      return "";
    }
    const kept: string[] = [];
    for (const sentence of splitSentences(cleaned)) {
      this.report.checked++;
      const ids = citedIds(sentence);
      const bad = this.unsupportedNumbers(sentence, ids.length ? ids : paragraphIds);
      if (bad.length) {
        this.report.removed++;
        this.report.notes.push(`Removed a sentence in ${opts.label}: number(s) ${bad.join(", ")} not found in cited sources.`);
        continue;
      }
      kept.push(sentence);
    }
    return kept.join(" ");
  }

  cleanFact(fact: { text: string; sources: string[] }): { text: string; sources: string[] } | null {
    this.report.checked++;
    const inline = citedIds(fact.text);
    const sources = [...new Set([...fact.sources.map((s) => s.trim().toUpperCase()), ...inline])].filter((s) => this.valid.has(s));
    const text = stripMarkers(fact.text);
    if (!sources.length || !text) {
      this.report.removed++;
      this.report.notes.push("Removed a key fact without a valid source.");
      return null;
    }
    const bad = this.unsupportedNumbers(text, sources);
    if (bad.length) {
      this.report.removed++;
      this.report.notes.push(`Removed a key fact: number(s) ${bad.join(", ")} not found in its sources.`);
      return null;
    }
    return { text, sources };
  }

  /** Titles carry no markers; any number in them must appear somewhere in the item's sources. */
  titleOk(title: string): boolean {
    this.report.checked++;
    const ok = this.unsupportedNumbers(title, []).length === 0;
    if (!ok) {
      this.report.removed++;
      this.report.notes.push("Replaced a headline containing an unsupported number with the source headline.");
    }
    return ok;
  }
}
