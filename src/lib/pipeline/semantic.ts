import { cosine, decodeVector, encodeVector, getEmbedder, relevanceFromCosine, type Embedder, type Vector } from "../embed";
import type { Store } from "../store/types";
import { CATEGORY_META, type Candidate, type Category, type Edition, type InterestProfile, type Preferences, type Prototype } from "../types";
import { sha1 } from "../util/text";

/** Weight of the semantic match (0..1) in the pre-score, next to the keyword score (typically 0..3). */
export const SEMANTIC_WEIGHT = 2.5;
const MAX_EMBED = 600;

interface PrototypeSpec {
  kind: Prototype["kind"];
  label: string;
  weight: number;
  text: string;
}

function specs(interest: InterestProfile, prefs: Preferences): PrototypeSpec[] {
  const out: PrototypeSpec[] = interest.topics.map((t) => ({
    kind: "topic",
    label: t.name,
    weight: t.weight,
    text: `${t.name}. ${[...t.keywords, ...(t.zhKeywords ?? [])].join("; ")}`,
  }));
  for (const title of (interest.scholar?.paperTitles ?? []).slice(0, 12)) {
    out.push({ kind: "work", label: title, weight: 0.85, text: title });
  }
  for (const term of prefs.watchTerms ?? []) out.push({ kind: "topic", label: term, weight: 0.8, text: term });
  for (const m of [...prefs.mutedTopics, ...interest.exclusions].slice(0, 12)) {
    out.push({ kind: "negative", label: m, weight: 1, text: m });
  }
  return out;
}

/** Embed topics, the person's own papers, watch terms and muted topics; cached on the profile until they change. */
export async function ensurePrototypes(interest: InterestProfile, prefs: Preferences, embedder = getEmbedder()): Promise<boolean> {
  if (!embedder) return false;
  const list = specs(interest, prefs);
  const hash = sha1(JSON.stringify([embedder.model, list.map((s) => [s.kind, s.text, s.weight])]));
  if (interest.prototypes?.hash === hash && interest.prototypes.model === embedder.model) return false;
  const vectors = await embedder.embed(list.map((s) => s.text));
  interest.prototypes = {
    model: embedder.model,
    hash,
    items: list.map((s, i) => ({ kind: s.kind, label: s.label, weight: s.weight, v: encodeVector(vectors[i]) })),
  };
  return true;
}

export interface FeedbackContext {
  /** Vectors of stories the reader liked or read (weighted), and of stories they disliked. */
  positive: { v: Vector; weight: number; label: string }[];
  negative: { v: Vector; label: string }[];
  likedPaperIds: string[];
  dislikedPaperIds: string[];
  /** −1..1 per category, from likes/dislikes, opens and source clicks. */
  affinity: Partial<Record<Category, number>>;
  opened: number;
}

export function emptyFeedback(): FeedbackContext {
  return { positive: [], negative: [], likedPaperIds: [], dislikedPaperIds: [], affinity: {}, opened: 0 };
}

/** Learn from explicit feedback and reading behaviour over recent editions. */
export async function loadFeedbackContext(store: Store, profileId: string, editions?: Edition[]): Promise<FeedbackContext> {
  const [feedback, interactions, recent] = await Promise.all([
    store.listFeedback(profileId, 80),
    store.listInteractions(profileId, 400).catch(() => []),
    editions ? Promise.resolve(editions) : store.recentEditions(profileId, 12),
  ]);
  const items = new Map<string, { edition: Edition; item: Edition["items"][number] }>();
  for (const e of recent) for (const it of e.items) items.set(`${e.id}/${it.id}`, { edition: e, item: it });

  const ctx = emptyFeedback();
  const score = new Map<Category, { s: number; n: number }>();
  const bump = (c: Category, s: number, n: number) => {
    const cur = score.get(c) ?? { s: 0, n: 0 };
    score.set(c, { s: cur.s + s, n: cur.n + n });
  };
  const used = new Set<string>();

  for (const f of feedback) {
    bump(f.category, f.signal, 1);
    const hit = items.get(`${f.editionId}/${f.itemId}`);
    used.add(`${f.editionId}/${f.itemId}`);
    if (!hit) continue;
    const v = decodeVector(hit.item.embedding);
    const paperIds = hit.item.sources.map((s) => s.paperId).filter((id): id is string => Boolean(id));
    if (f.signal === 1) {
      if (v) ctx.positive.push({ v, weight: 1, label: `a story you liked (“${hit.item.title}”)` });
      ctx.likedPaperIds.push(...paperIds);
    } else {
      if (v) ctx.negative.push({ v, label: hit.item.title });
      ctx.dislikedPaperIds.push(...paperIds);
    }
  }

  const opened = new Map<string, number>();
  const readEditions = new Set<string>();
  for (const i of interactions) {
    const key = `${i.editionId}/${i.itemId}`;
    opened.set(key, Math.max(opened.get(key) ?? 0, i.kind === "source" ? 0.8 : 0.6));
    readEditions.add(i.editionId);
  }
  for (const [key, weight] of opened) {
    const hit = items.get(key);
    const category = hit?.item.category ?? interactions.find((i) => `${i.editionId}/${i.itemId}` === key)?.category;
    if (category) bump(category, weight, 0.5);
    ctx.opened++;
    if (!hit || used.has(key)) continue;
    const v = decodeVector(hit.item.embedding);
    if (v) ctx.positive.push({ v, weight, label: `a story you read (“${hit.item.title}”)` });
  }
  // Stories shown in editions the reader did open, but skipped, count slightly against their category.
  for (const e of recent) {
    if (!readEditions.has(e.id)) continue;
    for (const it of e.items) if (!opened.has(`${e.id}/${it.id}`) && !used.has(`${e.id}/${it.id}`)) bump(it.category, -0.2, 0.2);
  }
  for (const [c, { s, n }] of score) ctx.affinity[c] = Math.max(-1, Math.min(1, s / (n + 4)));
  ctx.positive = ctx.positive.slice(0, 40);
  ctx.negative = ctx.negative.slice(0, 20);
  ctx.likedPaperIds = [...new Set(ctx.likedPaperIds)].slice(0, 20);
  ctx.dislikedPaperIds = [...new Set(ctx.dislikedPaperIds)].slice(0, 20);
  return ctx;
}

/** Ranking adjustment from category affinity, e.g. +3 for a category the reader opens often. */
export function affinityAdjustment(category: Category, affinity: Partial<Record<Category, number>>): { points: number; note?: string } {
  const a = affinity[category] ?? 0;
  const points = Math.round(a * 8);
  if (!points) return { points: 0 };
  const label = CATEGORY_META[category].label;
  return { points, note: points > 0 ? `+${points} you often read ${label}` : `${points} you rarely read ${label}` };
}

export function candidateText(c: Candidate): string {
  return `${c.title}\n${c.snippet || (c.content ?? "").slice(0, 600)}`;
}

/**
 * Embed candidates and score each against the reader's prototypes (topics, own papers, liked/read stories);
 * stories close to muted topics or disliked stories are damped. Returns false when no embedder is configured.
 */
export async function scoreSemantics(
  candidates: Candidate[],
  interest: InterestProfile,
  feedback: FeedbackContext,
  embedder: Embedder | null = getEmbedder(),
): Promise<boolean> {
  if (!embedder || !candidates.length) return false;
  const missing = candidates.filter((c) => !c.embedding).slice(0, MAX_EMBED);
  if (missing.length) {
    const vectors = await embedder.embed(missing.map(candidateText));
    missing.forEach((c, i) => (c.embedding = encodeVector(vectors[i])));
  }
  const protos = (interest.prototypes?.model === embedder.model ? interest.prototypes.items : [])
    .map((p) => ({ ...p, vec: decodeVector(p.v) }))
    .filter((p): p is Prototype & { vec: Vector } => p.vec !== null);
  const positive = [
    ...protos.filter((p) => p.kind !== "negative").map((p) => ({ v: p.vec, weight: p.weight, label: p.kind === "work" ? `your paper “${p.label}”` : `your topic “${p.label}”` })),
    ...feedback.positive,
  ];
  const negative = [...protos.filter((p) => p.kind === "negative").map((p) => ({ v: p.vec, label: `muted “${p.label}”` })), ...feedback.negative];
  if (!positive.length) return false;

  for (const c of candidates) {
    const v = decodeVector(c.embedding);
    if (!v) continue;
    let best = -1;
    let label = "";
    for (const p of positive) {
      const s = cosine(v, p.v) - (1 - p.weight) * 0.1;
      if (s > best) {
        best = s;
        label = p.label;
      }
    }
    let semantic = relevanceFromCosine(embedder, best);
    let worst = -1;
    for (const n of negative) worst = Math.max(worst, cosine(v, n.v));
    if (worst > best && relevanceFromCosine(embedder, worst) > 0.6) semantic *= 0.3;
    c.semantic = Math.round(semantic * 1000) / 1000;
    c.matched = label;
  }
  return true;
}

/** Engagement over the last 90 days and the learned category preferences, for the profile page. */
export async function readingSummary(store: Store, profileId: string, now = Date.now()) {
  const since = new Date(now - 90 * 86400e3).toISOString();
  const [interactions, feedback, learned] = await Promise.all([
    store.listInteractions(profileId, 1000).catch(() => []),
    store.listFeedback(profileId, 500),
    loadFeedbackContext(store, profileId).catch(() => null),
  ]);
  const recent = interactions.filter((i) => i.createdAt >= since);
  return {
    opened: new Set(recent.filter((i) => i.kind === "open").map((i) => `${i.editionId}/${i.itemId}`)).size,
    sources: recent.filter((i) => i.kind === "source").length,
    likes: feedback.filter((f) => f.signal === 1 && f.createdAt >= since).length,
    dislikes: feedback.filter((f) => f.signal === -1 && f.createdAt >= since).length,
    affinity: Object.entries(learned?.affinity ?? {})
      .map(([category, value]) => ({ category: category as Category, value: value ?? 0 }))
      .filter((a) => Math.round(Math.abs(a.value) * 8) > 0)
      .sort((a, b) => Math.abs(b.value) - Math.abs(a.value)),
  };
}
