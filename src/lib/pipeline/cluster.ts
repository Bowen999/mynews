import { z } from "zod";
import { completeJSON } from "../llm/json";
import { CATEGORIES, isCategory, type Candidate, type Category, type Cluster } from "../types";
import { formatRange, isoDay } from "../util/dates";
import { clamp, shortHash, titleSimilarity, truncate } from "../util/text";
import type { StageContext, StageResult } from "./context";
import { credibilityPrior } from "./credibility";
import { CLUSTER_SYSTEM, clusterPrompt } from "./prompts";

const score = z.coerce.number().catch(5);

export const ClusterSchema = z.object({
  clusters: z.array(
    z.object({
      ids: z.array(z.string()).min(1),
      category: z.string().catch("other"),
      label: z.string().catch(""),
      relevance: score,
      impact: score,
      novelty: score,
      credibility: score,
      value: score,
      rationale: z.string().catch(""),
    }),
  ),
});

/** Union-find grouping of near-duplicate titles (same story from several outlets). */
export function pregroup(candidates: Candidate[], threshold = 0.55): string[][] {
  const parent = candidates.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < candidates.length; i++)
    for (let j = i + 1; j < candidates.length; j++) {
      if (titleSimilarity(candidates[i].title, candidates[j].title) >= threshold) parent[find(j)] = find(i);
    }
  const groups = new Map<number, string[]>();
  candidates.forEach((c, i) => {
    const root = find(i);
    groups.set(root, [...(groups.get(root) ?? []), c.id]);
  });
  return [...groups.values()];
}

export function clusterId(ids: string[]): string {
  return `k${shortHash([...ids].sort().join(","), 10)}`;
}

function majorityCategory(members: Candidate[]): Category {
  const counts = new Map<Category, number>();
  for (const m of members) if (m.categoryHint) counts.set(m.categoryHint, (counts.get(m.categoryHint) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "other";
}

/** Deterministic fallback if the LLM clustering call fails. */
export function heuristicClusters(candidates: Candidate[]): Cluster[] {
  const byId = new Map(candidates.map((c) => [c.id, c]));
  return pregroup(candidates).map((ids) => {
    const members = ids.map((id) => byId.get(id)!);
    const best = Math.max(...members.map((m) => m.prescore ?? 0));
    const rel = clamp(best * 4, 0, 10);
    const cred = members.reduce((s, m) => s + credibilityPrior(m.url).score, 0) / members.length;
    return {
      id: clusterId(ids),
      candidateIds: ids,
      category: majorityCategory(members),
      label: members[0].title,
      scores: { relevance: rel, impact: 5, novelty: 6, credibility: cred, value: clamp(rel * 0.8, 0, 10) },
      rationale: "Scored heuristically from keyword overlap with your profile (model clustering unavailable).",
    };
  });
}

export function candidateLine(c: Candidate): string {
  const date = c.publishedAt ? c.publishedAt.slice(0, 10) : "date?";
  const src = c.publisher ? `${c.publisher} (${c.domain})` : c.domain;
  const signals = c.signals?.length ? c.signals.join(",") : "-";
  const snippet = truncate((c.snippet || c.content || "").replace(/\s+/g, " "), 200);
  return `${c.id} | ${c.categoryHint ?? "other"} | ${date} | ${src} | ${signals} | ${c.title}${snippet ? ` — ${snippet}` : ""}`;
}

/** Stage 5: group related candidates into stories and have the model rate each story for this reader. */
export async function clusterStage(ctx: StageContext): Promise<StageResult> {
  const interest = ctx.run.state.interest!;
  const candidates = ctx.run.state.candidates ?? [];
  if (!candidates.length) {
    ctx.run.state.clusters = [];
    ctx.log("warn", "No candidates were found in the 7-day window.");
    return { done: true };
  }
  const byId = new Map(candidates.map((c) => [c.id, c]));
  const enabled = CATEGORIES.filter((c) => ctx.profile.preferences.categories[c] !== false);
  const recent = await ctx.store.recentEditions(ctx.profile.id, 3);
  const previouslyCovered = recent.flatMap((e) => e.items.map((i) => i.title)).slice(0, 30);

  let clusters: Cluster[];
  try {
    await ctx.detail(`Clustering ${candidates.length} candidates into stories`);
    const out = await completeJSON(
      ctx.llm(),
      {
        purpose: "cluster",
        deadlineAt: ctx.deadline.at(10000),
        temperature: 0.1,
        maxTokens: 8000,
        messages: [
          { role: "system", content: CLUSTER_SYSTEM },
          {
            role: "user",
            content: clusterPrompt({
              today: isoDay(new Date()),
              windowLabel: formatRange(ctx.run.windowStart, ctx.run.windowEnd),
              profile: interest,
              candidates: candidates.map(candidateLine).join("\n"),
              previouslyCovered,
              enabledCategories: enabled,
            }),
          },
        ],
        mockContext: { candidates, groups: pregroup(candidates) },
      },
      ClusterSchema,
    );

    const used = new Set<string>();
    clusters = [];
    for (const k of out.clusters) {
      const ids = [...new Set(k.ids)].filter((id) => byId.has(id) && !used.has(id));
      if (!ids.length) continue;
      ids.forEach((id) => used.add(id));
      const members = ids.map((id) => byId.get(id)!);
      clusters.push({
        id: clusterId(ids),
        candidateIds: ids,
        category: isCategory(k.category) && enabled.includes(k.category) ? k.category : majorityCategory(members),
        label: k.label || members[0].title,
        scores: {
          relevance: clamp(k.relevance, 0, 10),
          impact: clamp(k.impact, 0, 10),
          novelty: clamp(k.novelty, 0, 10),
          credibility: clamp(k.credibility, 0, 10),
          value: clamp(k.value, 0, 10),
        },
        rationale: k.rationale,
      });
    }
    // Attach unassigned near-duplicates to the cluster they obviously belong to, so items aggregate all sources.
    for (const c of candidates) {
      if (used.has(c.id)) continue;
      const home = clusters.find((k) => k.candidateIds.some((id) => titleSimilarity(byId.get(id)!.title, c.title) >= 0.6));
      if (home) {
        home.candidateIds.push(c.id);
        used.add(c.id);
      }
    }
    if (!clusters.length) throw new Error("model returned no usable clusters");
  } catch (e) {
    ctx.log("warn", `Model clustering failed (${e instanceof Error ? e.message : String(e)}); using heuristic clustering.`);
    clusters = heuristicClusters(candidates);
  }

  ctx.run.state.clusters = clusters;
  ctx.log("info", `${candidates.length} candidates grouped into ${clusters.length} stories.`);
  await ctx.detail(`${clusters.length} distinct stories`);
  return { done: true };
}
