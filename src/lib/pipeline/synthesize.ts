import { z } from "zod";
import { completeJSON } from "../llm/json";
import type { AnalysisBlock, BriefingItem, BriefingSource, Candidate, Cluster, KeyFact } from "../types";
import { pMap } from "../util/concurrency";
import { isoDay } from "../util/dates";
import { shortHash, truncate } from "../util/text";
import type { StageContext, StageResult } from "./context";
import { credibilityPrior } from "./credibility";
import { SYNTH_SYSTEM, synthPrompt } from "./prompts";
import { ClaimVerifier, stripMarkers } from "./verify";

const MAX_SOURCES = 6;
const EXCERPT_BUDGET = 15000;

export const ItemSchema = z.object({
  title: z.string().min(3),
  category: z.string().optional(),
  summary: z.string().min(10),
  whyItMatters: z.string().catch(""),
  keyFacts: z
    .array(z.object({ text: z.string(), sources: z.array(z.string()).catch([]) }))
    .catch([]),
  analysis: z
    .array(z.object({ heading: z.string().optional().catch(undefined), body: z.string() }))
    .catch([]),
  relevanceExplanation: z.string().catch(""),
  confidence: z.enum(["high", "medium", "low"]).catch("medium"),
});

const DATE_NOTE: Record<Candidate["dateSource"], string> = {
  metadata: "from page metadata",
  page: "from the page",
  provider: "per search index",
  unknown: "not stated",
};

/** Order sources (most credible and substantive first) and assign stable S1..Sn ids. */
export function buildSources(members: Candidate[]): { sources: BriefingSource[]; texts: Map<string, string>; block: string } {
  const ordered = [...members]
    .sort((a, b) => {
      const d = credibilityPrior(b.url).score - credibilityPrior(a.url).score;
      if (Math.abs(d) > 0.4) return d;
      return (b.content?.length ?? b.snippet.length) - (a.content?.length ?? a.snippet.length);
    })
    .slice(0, MAX_SOURCES);
  const per = Math.floor(EXCERPT_BUDGET / ordered.length);
  const sources: BriefingSource[] = [];
  const texts = new Map<string, string>();
  const blocks: string[] = [];
  ordered.forEach((c, i) => {
    const id = `S${i + 1}`;
    const excerpt = truncate(c.content && c.content.length > c.snippet.length ? c.content : c.snippet, Math.min(4000, per));
    const meta = [
      `Publisher: ${c.publisher ?? c.domain}`,
      `Published: ${c.publishedAt ? `${c.publishedAt.slice(0, 10)} (${DATE_NOTE[c.dateSource]})` : "date not stated"}`,
      c.authors?.length ? `Authors: ${c.authors.slice(0, 8).join(", ")}${c.authors.length > 8 ? " et al." : ""}` : "",
      c.venue ? `Venue: ${c.venue}` : "",
      c.signals?.length ? `Reader signals: ${c.signals.join(", ")}` : "",
    ].filter(Boolean);
    blocks.push(`[${id}] ${c.title}\n${meta.join(" | ")}\nExcerpt: ${excerpt || "(headline only)"}`);
    sources.push({
      id,
      url: c.url,
      title: c.title,
      publisher: c.publisher,
      domain: c.domain,
      publishedAt: c.publishedAt,
      dateSource: c.dateSource,
      provider: c.provider,
      paperId: c.paperId,
    });
    texts.set(id, [c.title, c.snippet, c.content ?? "", c.publisher ?? "", c.publishedAt ?? "", (c.authors ?? []).join(" "), c.venue ?? ""].join("\n"));
  });
  return { sources, texts, block: blocks.join("\n\n") };
}

function dateSpan(sources: BriefingSource[]): { earliest?: string; latest?: string } {
  const dates = sources.map((s) => s.publishedAt).filter((d): d is string => Boolean(d)).sort();
  return { earliest: dates[0], latest: dates[dates.length - 1] };
}

/** Extractive fallback used when the model fails: quotes the lead source rather than inventing anything. */
function fallbackItem(cluster: Cluster, sources: BriefingSource[], members: Candidate[], rank: number, reason: string): BriefingItem {
  const lead = members.find((m) => m.url === sources[0].url) ?? members[0];
  const excerpt = truncate(lead.snippet || lead.content || "", 320);
  return {
    id: shortHash(cluster.id, 10),
    rank,
    category: cluster.category,
    title: lead.title,
    whyItMatters: stripMarkers(cluster.rationale),
    summary: excerpt ? `${excerpt} [S1]` : "",
    keyFacts: [],
    analysis: [],
    relevance: { explanation: cluster.rationale, scores: cluster.scores, total: cluster.total ?? 0, adjustments: cluster.adjustments ?? [] },
    sources,
    dates: dateSpan(sources),
    imageUrl: members.find((m) => m.imageUrl)?.imageUrl,
    confidence: "low",
    verification: { checkedClaims: 0, removedClaims: 0, notes: [`Automatic write-up unavailable (${reason}); showing the source excerpt.`] },
    embedding: cluster.embedding,
  };
}

export async function synthesizeCluster(ctx: StageContext, cluster: Cluster, members: Candidate[], rank: number): Promise<BriefingItem> {
  const interest = ctx.run.state.interest!;
  const { sources, texts, block } = buildSources(members);
  let out: z.infer<typeof ItemSchema>;
  try {
    out = await completeJSON(
      ctx.llm(),
      {
        purpose: "synthesize",
        deadlineAt: ctx.deadline.at(10000),
        temperature: 0.3,
        maxTokens: 3000,
        messages: [
          { role: "system", content: SYNTH_SYSTEM },
          {
            role: "user",
            content: synthPrompt({
              today: isoDay(new Date()),
              outputLanguage: ctx.profile.preferences.outputLanguage,
              profileSummary: interest.summary,
              topics: interest.topics.map((t) => t.name).join("; "),
              category: cluster.category,
              label: cluster.label,
              rationale: cluster.rationale,
              sources: block,
            }),
          },
        ],
        mockContext: { cluster, sources, members },
      },
      ItemSchema,
    );
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    ctx.log("warn", `Synthesis failed for "${cluster.label}": ${reason}`);
    return fallbackItem(cluster, sources, members, rank, "model error");
  }

  const lead = members.find((m) => m.url === sources[0].url) ?? members[0];
  const v = new ClaimVerifier(texts);
  const title = v.titleOk(out.title) ? stripMarkers(out.title) : lead.title;
  let summary = v.cleanProse(out.summary, { requireCitation: true, label: "the summary" });
  if (!summary) {
    summary = `${truncate(lead.snippet || lead.content || lead.title, 300)} [S1]`;
    v.report.notes.push("Summary replaced with a source excerpt because the generated one lacked support.");
  }
  const whyItMatters = v.cleanProse(out.whyItMatters, { requireCitation: false, label: "why it matters" });
  const keyFacts = out.keyFacts.map((f) => v.cleanFact(f)).filter((f): f is KeyFact => f !== null).slice(0, 6);
  const analysis: AnalysisBlock[] = [];
  for (const [i, p] of out.analysis.entries()) {
    const body = v.cleanProse(p.body, { requireCitation: true, label: `analysis paragraph ${i + 1}` });
    if (body) analysis.push({ heading: p.heading ? stripMarkers(p.heading) : undefined, body });
  }
  const relevanceExplanation = v.cleanProse(out.relevanceExplanation, { requireCitation: false, label: "the relevance note" });

  return {
    id: shortHash(cluster.id, 10),
    rank,
    category: cluster.category,
    title,
    whyItMatters,
    summary,
    keyFacts,
    analysis,
    relevance: {
      explanation: relevanceExplanation || stripMarkers(cluster.rationale),
      scores: cluster.scores,
      total: cluster.total ?? 0,
      adjustments: cluster.adjustments ?? [],
    },
    sources,
    dates: dateSpan(sources),
    imageUrl: members.find((m) => m.imageUrl && m.url === sources[0].url)?.imageUrl ?? members.find((m) => m.imageUrl)?.imageUrl,
    confidence: out.confidence,
    verification: { checkedClaims: v.report.checked, removedClaims: v.report.removed, notes: v.report.notes.slice(0, 10) },
    embedding: cluster.embedding,
  };
}

/** Stage 7: write each selected story with DeepSeek. Resumable across invocations. */
export async function synthesizeStage(ctx: StageContext): Promise<StageResult> {
  const state = ctx.run.state;
  const selected = state.selected ?? [];
  const pending = [...(state.pendingSynthesis ?? [])];
  const clusters = new Map((state.clusters ?? []).map((k) => [k.id, k]));
  const candidates = new Map((state.candidates ?? []).map((c) => [c.id, c]));
  const items = state.items ?? [];

  const batch = pending.slice(0, 10);
  let finished = items.length;
  await ctx.detail(`Writing ${finished + 1}–${Math.min(selected.length, finished + batch.length)} of ${selected.length}`);
  await pMap(
    batch,
    async (clusterId) => {
      if (ctx.deadline.expired(75000)) return;
      const cluster = clusters.get(clusterId);
      if (!cluster) {
        pending.splice(pending.indexOf(clusterId), 1);
        return;
      }
      const members = cluster.candidateIds.map((id) => candidates.get(id)).filter((c): c is Candidate => Boolean(c));
      const rank = selected.indexOf(clusterId) + 1;
      const item = await synthesizeCluster(ctx, cluster, members, rank);
      items.push(item);
      pending.splice(pending.indexOf(clusterId), 1);
      finished++;
      await ctx.detail(`Wrote ${finished} of ${selected.length} stories`);
    },
    5,
  );
  items.sort((a, b) => a.rank - b.rank);
  state.items = items;
  state.pendingSynthesis = pending;
  return { done: pending.length === 0 };
}
