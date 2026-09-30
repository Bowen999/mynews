import type { AlsoNoted, Candidate, Cluster, Edition } from "../types";
import { clamp, titleSimilarity } from "../util/text";
import type { StageContext, StageResult } from "./context";
import { credibilityPrior } from "./credibility";

export const WEIGHTS = { relevance: 0.3, impact: 0.2, novelty: 0.15, credibility: 0.15, value: 0.2 };
export const TOP_N = 10;
const CATEGORY_CAP = 4;
const MIN_TOTAL = 25;
/** Stories the model rates as barely related to the reader never make the top list. */
const MIN_RELEVANCE = 3;

export interface HistoryIndex {
  urls: Set<string>;
  titles: string[];
}

export function buildHistory(editions: Edition[]): HistoryIndex {
  const urls = new Set<string>();
  const titles: string[] = [];
  for (const e of editions)
    for (const it of e.items) {
      titles.push(it.title);
      for (const s of it.sources) urls.add(s.url);
    }
  return { urls, titles };
}

/** Final score = weighted model ratings (blended with a credibility prior) plus transparent adjustments. */
export function scoreCluster(k: Cluster, members: Candidate[], history: HistoryIndex): Cluster | null {
  const adjustments: string[] = [];
  let bonus = 0;

  const covered = members.filter((m) => history.urls.has(m.url) || history.urls.has(m.canonicalUrl)).length;
  if (covered === members.length) return null; // fully reported in an earlier edition
  if (covered > 0) {
    bonus -= 15;
    adjustments.push("−15 partly covered in an earlier edition");
  }
  if (history.titles.some((t) => titleSimilarity(t, k.label) >= 0.5 || members.some((m) => titleSimilarity(t, m.title) >= 0.6))) {
    bonus -= 10;
    adjustments.push("−10 similar story in an earlier edition");
  }

  const prior = members.reduce((s, m) => s + credibilityPrior(m.url).score, 0) / members.length;
  const credibility = clamp(0.7 * k.scores.credibility + 0.3 * prior, 0, 10);
  const scores = { ...k.scores, credibility: Math.round(credibility * 10) / 10 };

  const domains = new Set(members.map((m) => m.domain));
  if (domains.size > 1) {
    const b = Math.min(6, 3 * (domains.size - 1));
    bonus += b;
    adjustments.push(`+${b} corroborated by ${domains.size} independent sources`);
  }
  const signals = new Set(members.flatMap((m) => m.signals ?? []));
  if (signals.size) {
    bonus += 6;
    const label = [...signals]
      .map((s) => (s === "cites-your-work" ? "cites your work" : s === "your-work" ? "your publication" : "by a frequent co-author"))
      .join(", ");
    adjustments.push(`+6 ${label}`);
  }
  if (members.every((m) => m.dateSource === "unknown")) {
    bonus -= 8;
    adjustments.push("−8 publication date not stated on the page");
  }
  if (members.every((m) => !m.snippet && !m.content)) {
    bonus -= 6;
    adjustments.push("−6 headline-only source");
  }

  const base =
    10 *
    (WEIGHTS.relevance * scores.relevance +
      WEIGHTS.impact * scores.impact +
      WEIGHTS.novelty * scores.novelty +
      WEIGHTS.credibility * scores.credibility +
      WEIGHTS.value * scores.value);
  const total = Math.round(clamp(base + bonus, 0, 100) * 10) / 10;
  return { ...k, scores, total, adjustments };
}

/** Greedy top-N with a per-category cap so one category cannot crowd out the rest. */
export function selectTop(clusters: Cluster[], n = TOP_N, cap = CATEGORY_CAP): { selected: Cluster[]; rest: Cluster[] } {
  const sorted = [...clusters].sort((a, b) => (b.total ?? 0) - (a.total ?? 0));
  const selected: Cluster[] = [];
  const perCat = new Map<string, number>();
  const eligible = (k: Cluster) => (k.total ?? 0) >= MIN_TOTAL && k.scores.relevance >= MIN_RELEVANCE;
  for (const k of sorted) {
    if (selected.length >= n) break;
    if (!eligible(k)) continue;
    const count = perCat.get(k.category) ?? 0;
    if (count >= cap) continue;
    perCat.set(k.category, count + 1);
    selected.push(k);
  }
  // If the cap left slots empty, fill them with the best remaining stories.
  for (const k of sorted) {
    if (selected.length >= n) break;
    if (eligible(k) && !selected.includes(k)) selected.push(k);
  }
  selected.sort((a, b) => (b.total ?? 0) - (a.total ?? 0));
  return { selected, rest: sorted.filter((k) => !selected.includes(k)) };
}

export function leadCandidate(members: Candidate[]): Candidate {
  return [...members].sort((a, b) => {
    const cred = credibilityPrior(b.url).score - credibilityPrior(a.url).score;
    if (Math.abs(cred) > 0.1) return cred;
    return (b.content?.length ?? 0) - (a.content?.length ?? 0);
  })[0];
}

/** Stage 6: compute final scores, apply novelty against past editions, and pick the top 10. */
export async function rankStage(ctx: StageContext): Promise<StageResult> {
  const candidates = new Map((ctx.run.state.candidates ?? []).map((c) => [c.id, c]));
  const history = buildHistory(await ctx.store.recentEditions(ctx.profile.id, 4));
  const scored: Cluster[] = [];
  let repeats = 0;
  for (const k of ctx.run.state.clusters ?? []) {
    const members = k.candidateIds.map((id) => candidates.get(id)).filter((c): c is Candidate => Boolean(c));
    if (!members.length) continue;
    const s = scoreCluster(k, members, history);
    if (s) scored.push(s);
    else repeats++;
  }
  const { selected, rest } = selectTop(scored);
  ctx.run.state.clusters = scored;
  ctx.run.state.selected = selected.map((k) => k.id);
  ctx.run.state.pendingSynthesis = selected.map((k) => k.id);
  ctx.run.state.items = [];
  ctx.run.state.alsoNoted = rest
    .filter((k) => (k.total ?? 0) >= MIN_TOTAL && k.scores.relevance >= MIN_RELEVANCE)
    .slice(0, 8)
    .map((k): AlsoNoted => {
      const members = k.candidateIds.map((id) => candidates.get(id)!).filter(Boolean);
      const lead = leadCandidate(members);
      return { title: lead.title, url: lead.url, publisher: lead.publisher, domain: lead.domain, publishedAt: lead.publishedAt, category: k.category };
    });
  if (repeats) ctx.log("info", `${repeats} stories skipped because earlier editions already covered them.`);
  if (selected.length < TOP_N) ctx.log("warn", `Only ${selected.length} stories met the quality bar this week.`);
  if (!selected.length) throw new Error("No relevant stories were found for the past 7 days. Try adding sources or broadening topics.");
  await ctx.detail(`Top ${selected.length} selected from ${scored.length} stories`);
  return { done: true };
}
