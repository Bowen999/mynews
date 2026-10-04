import { config } from "../config";
import { extractUrl } from "../extract";
import { describeHealth, runSearchTasks, TavilyProvider, type TaggedResult } from "../search";
import type { Candidate, InterestProfile } from "../types";
import { pMap } from "../util/concurrency";
import { inWindow, parseDate, type Window } from "../util/dates";
import { hasCJK, shortHash, truncate } from "../util/text";
import { canonicalizeUrl, domainOf, extractDoi, isGitHub, safeUrl } from "../util/url";
import type { StageContext, StageResult } from "./context";
import { credibilityPrior } from "./credibility";
import { planSearch } from "./plan";
import { emptyFeedback, loadFeedbackContext, scoreSemantics, SEMANTIC_WEIGHT } from "./semantic";

const MAX_CONTENT = 6000;
const KEEP_AFTER_SEARCH = 240;
const ENRICH_TOP = 70;
const KEEP_AFTER_COLLECT = 80;

const SIGNAL_BOOST: Record<string, number> = { "your-work": 1.5, "cites-your-work": 1.2, coauthor: 0.8, watchlist: 0.8, recommended: 0.5 };
const FIELD_TITLE_BOOST = 0.6;
const FIELD_BODY_BOOST = 0.2;

function phraseHit(textLower: string, phrase: string): boolean {
  const p = phrase.toLowerCase().trim();
  if (p.length < 2) return false;
  if (hasCJK(p)) return textLower.includes(p);
  // Word-boundary match for Latin phrases to avoid "ai" matching "said".
  const escaped = p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}($|[^\\p{L}\\p{N}])`, "u").test(textLower);
}

/** Watchlist terms that appear in the candidate's title or text. */
export function watchHits(c: Candidate, terms: string[]): string[] {
  const text = `${c.title} ${c.snippet} ${(c.content ?? "").slice(0, 3000)}`.toLowerCase();
  return terms.filter((t) => phraseHit(text, t));
}

/**
 * Pre-score used to decide which candidates are worth fetching and clustering: keyword overlap with the
 * profile, plus the semantic match with the reader's prototypes when embeddings are available.
 */
export function prescore(c: Candidate, profile: InterestProfile): number {
  const title = c.title.toLowerCase();
  const body = `${c.snippet} ${(c.content ?? "").slice(0, 2000)}`.toLowerCase();
  let score = 0;
  for (const t of profile.topics) {
    let hits = 0;
    for (const k of [t.name, ...t.keywords, ...(t.zhKeywords ?? [])]) {
      if (phraseHit(title, k)) hits += 3;
      else if (phraseHit(body, k)) hits += 1;
    }
    score += t.weight * Math.min(1, hits / 3);
  }
  const entities = [
    ...profile.entities.people,
    ...profile.entities.organizations,
    ...profile.entities.companies,
    ...profile.entities.products,
    ...profile.entities.venues,
  ];
  let entityHits = 0;
  for (const e of entities) if (phraseHit(title, e) || phraseHit(body, e)) entityHits++;
  score += Math.min(0.9, entityHits * 0.3);
  // Organizations the reader follows: a story about one (named in the headline) counts more than a passing mention.
  let field = 0;
  for (const f of profile.fieldEntities ?? []) {
    const names = [f.name, ...f.aliases];
    if (names.some((n) => phraseHit(title, n))) field = Math.max(field, FIELD_TITLE_BOOST * f.weight);
    else if (names.some((n) => phraseHit(body, n))) field = Math.max(field, FIELD_BODY_BOOST * f.weight);
  }
  score += field;
  for (const x of profile.exclusions) if (phraseHit(title, x)) score -= 1;
  for (const s of c.signals ?? []) score += SIGNAL_BOOST[s] ?? 0;
  if (c.watch?.length && !c.signals?.includes("watchlist")) score += SIGNAL_BOOST.watchlist;
  if (c.semantic !== undefined) score += SEMANTIC_WEIGHT * c.semantic;
  score += credibilityPrior(c.url).score * 0.05;
  score += c.dateSource === "unknown" ? -0.2 : 0.1;
  if (!c.snippet && !c.content) score -= 0.2;
  return Math.round(score * 1000) / 1000;
}

export function toCandidate(r: TaggedResult, window: Window): Candidate | null {
  if (!r.url || !r.title || !safeUrl(r.url) || isGitHub(r.url)) return null;
  const canonicalUrl = canonicalizeUrl(r.url);
  const date = parseDate(r.publishedAt);
  if (date && !inWindow(date, window)) return null;
  return {
    id: `c${shortHash(canonicalUrl, 10)}`,
    url: r.url,
    canonicalUrl,
    title: r.title.trim(),
    snippet: truncate(r.snippet ?? "", 700),
    content: r.content ? truncate(r.content, MAX_CONTENT) : undefined,
    publishedAt: date?.toISOString(),
    dateSource: date ? r.dateSource : "unknown",
    publisher: r.publisher,
    domain: domainOf(r.url),
    categoryHint: r.category,
    provider: r.provider,
    query: r.query,
    lang: r.lang ?? (hasCJK(r.title) ? "zh" : "en"),
    authors: r.authors,
    venue: r.venue,
    doi: r.doi ?? extractDoi(r.url),
    imageUrl: r.imageUrl && safeUrl(r.imageUrl)?.protocol === "https:" ? r.imageUrl : undefined,
    signals: r.signals?.length ? [...new Set(r.signals)] : undefined,
    paperId: r.paperId,
  };
}

/** Merge exact duplicates (same canonical URL or DOI), keeping the richest record. */
export function mergeDuplicates(list: Candidate[]): Candidate[] {
  const byKey = new Map<string, Candidate>();
  const out: Candidate[] = [];
  for (const c of list) {
    const keys = [c.canonicalUrl, c.doi ? `doi:${c.doi}` : ""].filter(Boolean);
    const existing = keys.map((k) => byKey.get(k)).find(Boolean);
    if (!existing) {
      out.push(c);
      for (const k of keys) byKey.set(k, c);
      continue;
    }
    if ((c.content?.length ?? 0) > (existing.content?.length ?? 0)) existing.content = c.content;
    if (c.snippet.length > existing.snippet.length) existing.snippet = c.snippet;
    if (!existing.publishedAt && c.publishedAt) {
      existing.publishedAt = c.publishedAt;
      existing.dateSource = c.dateSource;
    }
    if (c.dateSource === "metadata" && existing.dateSource !== "metadata" && c.publishedAt) {
      existing.publishedAt = c.publishedAt;
      existing.dateSource = "metadata";
    }
    existing.signals = [...new Set([...(existing.signals ?? []), ...(c.signals ?? [])])];
    if (!existing.signals.length) existing.signals = undefined;
    existing.authors ??= c.authors;
    existing.venue ??= c.venue;
    existing.doi ??= c.doi;
    existing.imageUrl ??= c.imageUrl;
    existing.publisher ??= c.publisher;
    existing.paperId ??= c.paperId;
    if (c.canonicalUrl !== existing.canonicalUrl) {
      existing.duplicates = [...(existing.duplicates ?? []), { url: c.url, publisher: c.publisher, provider: c.provider }];
    }
    for (const k of keys) byKey.set(k, existing);
  }
  return out;
}

/** Stage 3: plan and run searches across providers for the previous 7 days, then score candidates semantically. */
export async function searchStage(ctx: StageContext): Promise<StageResult> {
  const interest = ctx.run.state.interest;
  if (!interest) throw new Error("Interest profile missing");
  const feedback = await loadFeedbackContext(ctx.store, ctx.profile.id).catch((e) => {
    ctx.log("warn", `Could not load reading history: ${e instanceof Error ? e.message : String(e)}`);
    return emptyFeedback();
  });
  const tasks = planSearch(interest, ctx.profile.preferences, {
    likedPaperIds: feedback.likedPaperIds,
    dislikedPaperIds: feedback.dislikedPaperIds,
  });
  await ctx.detail(`Running ${tasks.length} searches`);
  const outcome = await runSearchTasks(
    tasks,
    { window: ctx.window, maxResults: 12 },
    {
      deadlineMs: Math.max(30000, ctx.deadline.remaining() - 60000),
      onProgress: (done, total) => void ctx.detail(`Searched ${done} of ${total} queries`),
    },
  );
  for (const h of outcome.health) ctx.log("warn", `Search: ${describeHealth(h)}`);
  if (!outcome.providersUsed.length) {
    throw new Error(`All search providers failed. ${outcome.errors.slice(0, 3).join(" | ")}`);
  }

  let outOfWindow = 0;
  const normalized: Candidate[] = [];
  for (const r of outcome.results) {
    const c = toCandidate(r, ctx.window);
    if (c) normalized.push(c);
    else outOfWindow++;
  }
  const merged = mergeDuplicates(normalized);
  const watchTerms = ctx.profile.preferences.watchTerms ?? [];
  for (const c of merged) {
    const hits = watchHits(c, watchTerms);
    c.watch = hits.length ? hits : undefined;
    c.prescore = prescore(c, interest);
  }
  merged.sort((a, b) => (b.prescore ?? 0) - (a.prescore ?? 0));

  // Semantic scoring with embeddings (topics, own papers, liked/read stories); keyword-only without an embedder.
  if (!ctx.deadline.expired(25000)) {
    try {
      await ctx.detail(`Scoring ${Math.min(merged.length, 600)} candidates against your profile`);
      if (await scoreSemantics(merged.slice(0, 600), interest, feedback)) {
        for (const c of merged) c.prescore = prescore(c, interest);
        merged.sort((a, b) => (b.prescore ?? 0) - (a.prescore ?? 0));
        ctx.run.state.semantic = true;
      }
    } catch (e) {
      ctx.log("warn", `Semantic scoring failed (${e instanceof Error ? e.message : String(e)}); using keyword scores.`);
    }
  }

  ctx.run.state.queriesRun = outcome.tasksRun;
  ctx.run.state.providers = outcome.providersUsed;
  ctx.run.state.rawCount = outcome.results.length;
  ctx.run.state.candidates = merged.slice(0, KEEP_AFTER_SEARCH);
  ctx.log(
    "info",
    `${outcome.results.length} results from ${outcome.providersUsed.join(", ")}; ${merged.length} unique after URL/DOI dedupe; ${outOfWindow} dropped (outside window or invalid).${ctx.run.state.semantic ? " Ranked semantically with embeddings." : ""}`,
  );
  await ctx.detail(`${outcome.results.length} results → ${merged.length} unique candidates`);
  return { done: true };
}

function needsEnrichment(c: Candidate): boolean {
  if (c.domain === "news.google.com") return false; // redirect links cannot be fetched server-side
  if (["semantic-scholar", "europe-pmc", "arxiv", "mock"].includes(c.provider) && c.content) return false; // abstracts already in hand
  return !c.content || c.content.length < 700 || c.dateSource === "unknown";
}

/** Stage 4: fetch full text for the most promising candidates and verify publication dates. */
export async function collectStage(ctx: StageContext): Promise<StageResult> {
  const interest = ctx.run.state.interest!;
  const all = ctx.run.state.candidates ?? [];
  const top = all.slice(0, ENRICH_TOP);
  const targets = top.filter(needsEnrichment);
  let jinaBudget = config.mockMode ? 0 : config.search.jinaKey ? 25 : 10;
  let fetched = 0;
  let dropped = 0;
  const failed: Candidate[] = [];

  await ctx.detail(`Reading ${targets.length} articles`);
  await pMap(
    targets,
    async (c) => {
      if (ctx.deadline.expired(40000)) return;
      const allowJina = jinaBudget > 0;
      if (allowJina) jinaBudget--;
      try {
        const page = await extractUrl(c.url, { allowJina, timeoutMs: 10000 });
        if (page.text.length > (c.content?.length ?? 0)) c.content = truncate(page.text, MAX_CONTENT);
        if (!c.snippet && page.description) c.snippet = truncate(page.description, 700);
        if (!c.imageUrl && page.imageUrl?.startsWith("https://")) c.imageUrl = page.imageUrl;
        if (page.siteName && !c.publisher) c.publisher = page.siteName;
        const pageDate = parseDate(page.publishedAt);
        if (pageDate && (c.dateSource === "unknown" || c.dateSource === "provider" || page.dateSource === "metadata")) {
          c.publishedAt = pageDate.toISOString();
          c.dateSource = page.dateSource;
        }
      } catch {
        failed.push(c);
      } finally {
        fetched++;
        if (fetched % 5 === 0) await ctx.detail(`Read ${fetched} of ${targets.length} articles`);
      }
    },
    8,
  );

  // Tavily's extractor as a second chance for pages that blocked direct fetching.
  if (failed.length && config.search.tavilyKey && !ctx.deadline.expired(45000)) {
    try {
      const tavily = new TavilyProvider(config.search.tavilyKey);
      const texts = await tavily.extract(failed.map((c) => c.url));
      for (const c of failed) {
        const t = texts.get(c.url);
        if (t && t.length > (c.content?.length ?? 0)) c.content = truncate(t, MAX_CONTENT);
      }
    } catch (e) {
      ctx.log("warn", `Tavily extract failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  const kept = all.filter((c) => {
    if (c.publishedAt && !inWindow(new Date(c.publishedAt), ctx.window)) {
      dropped++;
      return false;
    }
    return true;
  });
  const watchTerms = ctx.profile.preferences.watchTerms ?? [];
  for (const c of kept) {
    const hits = watchHits(c, watchTerms);
    c.watch = hits.length ? hits : undefined;
    c.prescore = prescore(c, interest);
  }
  kept.sort((a, b) => (b.prescore ?? 0) - (a.prescore ?? 0));
  ctx.run.state.candidates = kept.slice(0, KEEP_AFTER_COLLECT);

  const verified = ctx.run.state.candidates.filter((c) => c.dateSource === "metadata" || c.dateSource === "page").length;
  ctx.log(
    "info",
    `Read ${targets.length - failed.length}/${targets.length} pages; ${dropped} dropped after date check; ${verified} of ${ctx.run.state.candidates.length} kept candidates have page-verified dates.`,
  );
  await ctx.detail(`${ctx.run.state.candidates.length} candidates in the 7-day window`);
  return { done: true };
}
