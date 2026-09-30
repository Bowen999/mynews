import { z } from "zod";
import { completeJSON } from "../llm/json";
import { renderStandalone } from "../render/standalone";
import { CATEGORY_META, type BriefingItem, type Edition } from "../types";
import { formatRange, isoDay } from "../util/dates";
import { shortHash, truncate } from "../util/text";
import type { StageContext, StageResult } from "./context";
import { EDITION_SYSTEM, editionPrompt } from "./prompts";
import { claimNumbers, normalizeHaystack, numberSupported, stripMarkers } from "./verify";

const CoverSchema = z.object({
  headline: z.string().min(3),
  dek: z.string().catch(""),
  themes: z.array(z.string()).catch([]),
});

function itemsHaystack(items: BriefingItem[]): string {
  return normalizeHaystack(
    items.map((i) => [i.title, i.summary, i.whyItMatters, ...i.keyFacts.map((f) => f.text), ...i.sources.map((s) => s.title)].join("\n")).join("\n"),
  );
}

/** Cover text may only restate item content: item references must exist and numbers must appear in the items. */
export function validateCover(cover: z.infer<typeof CoverSchema>, items: BriefingItem[]): Cover | null {
  const hay = itemsHaystack(items);
  const unsupported = (t: string) => claimNumbers(t.replace(/\[\d+\]/g, "")).some((n) => !numberSupported(n, hay));
  const dek = cover.dek.replace(/\[(\d+)\]/g, (m, n: string) => (Number(n) >= 1 && Number(n) <= items.length ? m : "")).trim();
  if (unsupported(cover.headline) || unsupported(dek)) return null;
  return {
    headline: truncate(stripMarkers(cover.headline), 110),
    dek,
    themes: cover.themes.map((t) => t.trim()).filter(Boolean).slice(0, 5),
  };
}

interface Cover {
  headline: string;
  dek: string;
  themes: string[];
}

function fallbackCover(items: BriefingItem[]): Cover {
  return {
    headline: items[0]?.title ?? "Your weekly briefing",
    dek: items
      .slice(0, 3)
      .map((i, idx) => `${i.title} [${idx + 1}]`)
      .join(" · "),
    themes: [...new Set(items.map((i) => CATEGORY_META[i.category].label))].slice(0, 4),
  };
}

/** Stage 8: write the edition cover, render the standalone page, and save the edition. */
export async function publishStage(ctx: StageContext): Promise<StageResult> {
  const state = ctx.run.state;
  const items = [...(state.items ?? [])].sort((a, b) => a.rank - b.rank).map((it, i) => ({ ...it, rank: i + 1 }));
  if (!items.length) throw new Error("No briefing items were produced.");
  const windowLabel = formatRange(ctx.run.windowStart, ctx.run.windowEnd);

  let cover = fallbackCover(items);
  try {
    await ctx.detail("Writing the edition cover");
    const out = await completeJSON(
      ctx.llm(),
      {
        purpose: "edition",
        deadlineAt: ctx.deadline.at(10000),
        temperature: 0.4,
        maxTokens: 800,
        messages: [
          { role: "system", content: EDITION_SYSTEM },
          {
            role: "user",
            content: editionPrompt({
              outputLanguage: ctx.profile.preferences.outputLanguage,
              windowLabel,
              items: items.map((i) => `${i.rank}. [${i.category}] ${i.title} — ${stripMarkers(i.summary)}`).join("\n"),
            }),
          },
        ],
        mockContext: { items },
      },
      CoverSchema,
    );
    const valid = validateCover(out, items);
    if (valid) cover = valid;
    else ctx.log("warn", "Cover text referenced unsupported numbers; using a plain cover.");
  } catch (e) {
    ctx.log("warn", `Cover generation failed: ${e instanceof Error ? e.message : String(e)}`);
  }

  const llm = ctx.llm();
  const number = await ctx.store.nextEditionNumber(ctx.profile.id);
  const started = new Date(ctx.run.createdAt).getTime();
  const edition: Edition = {
    id: `${isoDay(new Date(ctx.run.windowEnd))}-${shortHash(ctx.run.id, 6)}`,
    profileId: ctx.profile.id,
    runId: ctx.run.id,
    number,
    headline: cover.headline,
    dek: cover.dek,
    themes: cover.themes,
    windowStart: ctx.run.windowStart,
    windowEnd: ctx.run.windowEnd,
    createdAt: new Date().toISOString(),
    items,
    alsoNoted: state.alsoNoted ?? [],
    stats: {
      queries: state.queriesRun ?? 0,
      providers: state.providers ?? [],
      candidates: state.rawCount ?? 0,
      inWindow: state.candidates?.length ?? 0,
      clusters: state.clusters?.length ?? 0,
      durationMs: Date.now() - started,
      removedClaims: items.reduce((s, i) => s + i.verification.removedClaims, 0),
    },
    profileSummary: state.interest?.summary ?? "",
    model: { provider: llm.name, model: llm.model },
    sample: llm.name === "mock" ? true : undefined,
  };
  const html = renderStandalone(edition);
  await ctx.store.saveEdition(edition, html);
  ctx.run.editionId = edition.id;
  ctx.log("info", `Edition No. ${number} published with ${items.length} stories.`);
  await ctx.detail(`Edition No. ${number} is ready`);
  return { done: true };
}
