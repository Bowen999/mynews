import { decodeVector, encodeVector, getEmbedder, maxSimilarity, mean, type Vector } from "../embed";
import type { AlsoNoted, Candidate, Category, Cluster, Edition } from "../types";
import { clamp, titleSimilarity } from "../util/text";
import type { StageContext, StageResult } from "./context";
import { credibilityPrior } from "./credibility";
import { affinityAdjustment, loadFeedbackContext } from "./semantic";

export const WEIGHTS = { relevance: 0.3, impact: 0.2, novelty: 0.15, credibility: 0.15, value: 0.2 };
export const TOP_N = 10;
const CATEGORY_CAP = 4;
const MIN_TOTAL = 25;
/** Stories the model rates as barely related to the reader never make the top list. */
const MIN_RELEVANCE = 3;
/** Share of the relevance score that comes from the embedding match (the rest is the model's rating). */
const SEMANTIC_SHARE = 0.25;
const MAX_DIVERSITY_PENALTY = 20;

const PERSONAL_SIGNALS: Record<string, string> = {
  "cites-your-work": "cites your work",
  "your-work": "your publication",
  coauthor: "by a frequent co-author",
};

export interface HistoryIndex {
  urls: Set<string>;
  titles: string[];
  vectors: Vector[];
}

export function buildHistory(editions: Edition[]): HistoryIndex {
  const urls = new Set<string>();
  const titles: string[] = [];
  const vectors: Vector[] = [];
  for (const e of editions)
    for (const it of e.items) {
      titles.push(it.title);
      for (const s of it.sources) urls.add(s.url);
      const v = decodeVector(it.embedding);
      if (v) vectors.push(v);
    }
  return { urls, titles, vectors };
}

export interface RankOptions {
  /** −1..1 per category, learned from feedback and reading. */
  affinity?: Partial<Record<Category, number>>;
  /** Cosine at or above which two embeddings describe the same story. */
  sameStory?: number;
}

/** Final score = weighted ratings (relevance blended with the embedding match, credibility with a domain prior) plus transparent adjustments. */
export function scoreCluster(k: Cluster, members: Candidate[], history: HistoryIndex, opts: RankOptions = {}): Cluster | null {
  const adjustments: string[] = [];
  let bonus = 0;

  const covered = members.filter((m) => history.urls.has(m.url) || history.urls.has(m.canonicalUrl)).length;
  if (covered === members.length) return null; // fully reported in an earlier edition
  if (covered > 0) {
    bonus -= 15;
    adjustments.push("−15 partly covered in an earlier edition");
  }

  const vectors = members.map((m) => decodeVector(m.embedding)).filter((v): v is Vector => v !== null);
  const centroid = mean(vectors);
  const semanticRepeat =
    centroid && opts.sameStory !== undefined && history.vectors.length > 0 && maxSimilarity(centroid, history.vectors).sim >= opts.sameStory;
  if (semanticRepeat || history.titles.some((t) => titleSimilarity(t, k.label) >= 0.5 || members.some((m) => titleSimilarity(t, m.title) >= 0.6))) {
    bonus -= 10;
    adjustments.push("−10 similar story in an earlier edition");
  }

  const prior = members.reduce((s, m) => s + credibilityPrior(m.url).score, 0) / members.length;
  const credibility = clamp(0.7 * k.scores.credibility + 0.3 * prior, 0, 10);
  const best = [...members].sort((a, b) => (b.semantic ?? -1) - (a.semantic ?? -1))[0];
  let relevance = k.scores.relevance;
  if (best?.semantic !== undefined) {
    relevance = clamp((1 - SEMANTIC_SHARE) * k.scores.relevance + SEMANTIC_SHARE * 10 * best.semantic, 0, 10);
    if (best.matched) adjustments.push(`Closest to ${best.matched} (match ${best.semantic.toFixed(2)})`);
  }
  const scores = { ...k.scores, relevance: Math.round(relevance * 10) / 10, credibility: Math.round(credibility * 10) / 10 };

  const domains = new Set(members.map((m) => m.domain));
  if (domains.size > 1) {
    const b = Math.min(6, 3 * (domains.size - 1));
    bonus += b;
    adjustments.push(`+${b} corroborated by ${domains.size} independent sources`);
  }
  const signals = new Set(members.flatMap((m) => m.signals ?? []));
  const personal = [...signals].filter((s) => s in PERSONAL_SIGNALS);
  if (personal.length) {
    bonus += 6;
    adjustments.push(`+6 ${personal.map((s) => PERSONAL_SIGNALS[s]).join(", ")}`);
  }
  const watched = [...new Set(members.flatMap((m) => m.watch ?? []))];
  if (watched.length || signals.has("watchlist")) {
    bonus += 5;
    adjustments.push(watched.length ? `+5 on your watchlist: ${watched.slice(0, 3).join(", ")}` : "+5 from a feed on your watchlist");
  }
  if (signals.has("recommended") && !personal.length) {
    bonus += 3;
    adjustments.push("+3 recommended by Semantic Scholar from your papers and likes");
  }
  const affinity = affinityAdjustment(k.category, opts.affinity ?? {});
  if (affinity.note) {
    bonus += affinity.points;
    adjustments.push(affinity.note);
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
  return { ...k, scores, total, adjustments, embedding: centroid ? encodeVector(centroid) : k.embedding };
}

/**
 * Greedy top-N with a per-category cap so one category cannot crowd out the rest, and (with embeddings) a
 * diversity penalty for stories that closely resemble one already picked (maximal marginal relevance).
 */
export function selectTop(
  clusters: Cluster[],
  n = TOP_N,
  cap = CATEGORY_CAP,
  diversity?: { from: number },
): { selected: Cluster[]; rest: Cluster[] } {
  const eligible = (k: Cluster) => (k.total ?? 0) >= MIN_TOTAL && k.scores.relevance >= MIN_RELEVANCE;
  const pool = [...clusters].sort((a, b) => (b.total ?? 0) - (a.total ?? 0));
  const vec = new Map(pool.map((k) => [k.id, decodeVector(k.embedding)]));
  const selected: Cluster[] = [];
  const perCat = new Map<string, number>();

  const penalty = (k: Cluster): { points: number; near?: Cluster } => {
    const v = vec.get(k.id);
    if (!diversity || !v) return { points: 0 };
    let best = { sim: -1, near: undefined as Cluster | undefined };
    for (const s of selected) {
      const w = vec.get(s.id);
      if (!w) continue;
      const sim = maxSimilarity(v, [w]).sim;
      if (sim > best.sim) best = { sim, near: s };
    }
    const points = Math.round(clamp((best.sim - diversity.from) / (1 - diversity.from), 0, 1) * MAX_DIVERSITY_PENALTY);
    return { points, near: best.near };
  };

  const pick = (respectCap: boolean) => {
    while (selected.length < n) {
      let choice: { k: Cluster; effective: number; points: number; near?: Cluster } | undefined;
      for (const k of pool) {
        if (selected.includes(k) || !eligible(k)) continue;
        if (respectCap && (perCat.get(k.category) ?? 0) >= cap) continue;
        const p = penalty(k);
        const effective = (k.total ?? 0) - p.points;
        if (!choice || effective > choice.effective) choice = { k, effective, points: p.points, near: p.near };
      }
      if (!choice) return;
      if (choice.points > 0 && choice.near) {
        const idx = pool.indexOf(choice.k);
        choice.k = {
          ...choice.k,
          total: Math.round(Math.max(0, choice.effective) * 10) / 10,
          adjustments: [...(choice.k.adjustments ?? []), `−${choice.points} overlaps with “${choice.near.label}”, already in this edition`],
        };
        pool[idx] = choice.k;
      }
      perCat.set(choice.k.category, (perCat.get(choice.k.category) ?? 0) + 1);
      selected.push(choice.k);
    }
  };
  pick(true);
  // If the cap left slots empty, fill them with the best remaining stories.
  pick(false);

  selected.sort((a, b) => (b.total ?? 0) - (a.total ?? 0));
  return { selected, rest: pool.filter((k) => !selected.some((s) => s.id === k.id)) };
}

export function leadCandidate(members: Candidate[]): Candidate {
  return [...members].sort((a, b) => {
    const cred = credibilityPrior(b.url).score - credibilityPrior(a.url).score;
    if (Math.abs(cred) > 0.1) return cred;
    return (b.content?.length ?? 0) - (a.content?.length ?? 0);
  })[0];
}

/** Stage 6: compute final scores, apply novelty against past editions and learned preferences, and pick the top 10. */
export async function rankStage(ctx: StageContext): Promise<StageResult> {
  const candidates = new Map((ctx.run.state.candidates ?? []).map((c) => [c.id, c]));
  const editions = await ctx.store.recentEditions(ctx.profile.id, 12);
  const history = buildHistory(editions.slice(0, 4));
  const feedback = await loadFeedbackContext(ctx.store, ctx.profile.id, editions).catch(() => null);
  const embedder = ctx.run.state.semantic ? getEmbedder() : null;
  const opts: RankOptions = { affinity: feedback?.affinity, sameStory: embedder?.calibration.sameStory };

  const scored: Cluster[] = [];
  let repeats = 0;
  for (const k of ctx.run.state.clusters ?? []) {
    const members = k.candidateIds.map((id) => candidates.get(id)).filter((c): c is Candidate => Boolean(c));
    if (!members.length) continue;
    const s = scoreCluster(k, members, history, opts);
    if (s) scored.push(s);
    else repeats++;
  }
  const diversity = embedder ? { from: (embedder.calibration.ceil + embedder.calibration.sameStory) / 2 } : undefined;
  const { selected, rest } = selectTop(scored, TOP_N, CATEGORY_CAP, diversity);
  ctx.run.state.clusters = scored.map((k) => selected.find((s) => s.id === k.id) ?? k);
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
  if (feedback?.opened) ctx.log("info", `Learned from ${feedback.opened} stories you opened and your likes/dislikes.`);
  if (selected.length < TOP_N) ctx.log("warn", `Only ${selected.length} stories met the quality bar this week.`);
  if (!selected.length) throw new Error("No relevant stories were found for the past 7 days. Try adding sources or broadening topics.");
  await ctx.detail(`Top ${selected.length} selected from ${scored.length} stories`);
  return { done: true };
}
