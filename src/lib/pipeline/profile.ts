import { z } from "zod";
import { config } from "../config";
import { completeJSON } from "../llm/json";
import { resolveAuthor } from "../search/openalex";
import { CATEGORIES, isCategory, type Category, type InterestProfile, type SearchQuery } from "../types";
import { isoDay } from "../util/dates";
import { clamp, hasCJK, sha1, truncate, uniq, uniqBy } from "../util/text";
import type { StageContext, StageResult } from "./context";
import { PROFILE_SYSTEM, profilePrompt } from "./prompts";

const PROFILE_VERSION = 3;
const REUSE_MAX_AGE_DAYS = 14;

const str = z.string().catch("");
const strArr = z.array(z.string()).catch([]);

export const ProfileSchema = z.object({
  summary: z.string().min(1),
  person: z
    .object({ name: str, aliases: strArr, roles: strArr, affiliations: strArr, location: str })
    .partial()
    .catch({}),
  topics: z
    .array(
      z.object({
        name: z.string().min(1),
        weight: z.coerce.number().catch(0.5),
        keywords: strArr,
        zhKeywords: strArr.optional(),
      }),
    )
    .min(1),
  entities: z
    .object({ people: strArr, organizations: strArr, companies: strArr, venues: strArr, products: strArr })
    .partial()
    .catch({}),
  queries: z
    .array(z.object({ category: z.string(), query: z.string().min(2), lang: z.string().catch("en") }))
    .min(1),
  languages: strArr,
  exclusions: strArr,
});

type ProfileOutput = z.infer<typeof ProfileSchema>;

function containsAny(text: string, needles: string[]): boolean {
  const t = text.toLowerCase();
  return needles.some((n) => n && t.includes(n.toLowerCase()));
}

/** Template queries guarantee every enabled category is searched even if the model skipped it. */
function fallbackQueries(profile: InterestProfile, category: Category): SearchQuery[] {
  const top = profile.topics.slice(0, 3);
  const kw = (i: number) => top[i]?.keywords[0] ?? top[i]?.name;
  const first = kw(0);
  if (!first) return [];
  const zh = top.flatMap((t) => t.zhKeywords ?? []).filter(Boolean);
  switch (category) {
    case "paper":
      return top.map((t) => ({ category, query: t.keywords[0] ?? t.name, lang: "en" as const }));
    case "funding":
      return [{ category, query: `${first} startup funding`, lang: "en" }];
    case "event":
      return [{ category, query: `${first} conference`, lang: "en" }];
    case "job":
      return [{ category, query: `${first} postdoc position`, lang: "en" }];
    case "patent":
      return [{ category, query: `${first} method`, lang: "en" }];
    case "product":
      return [{ category, query: `${first} launch`, lang: "en" }];
    case "wechat":
      return [{ category, query: zh[0] ?? top[0].name, lang: "zh" }];
    case "people":
      return (profile.entities.organizations.slice(0, 2).length ? profile.entities.organizations.slice(0, 2) : [first]).map((q) => ({
        category,
        query: q,
        lang: "en" as const,
      }));
    default:
      return [{ category, query: first, lang: "en" }];
  }
}

export function normalizeProfile(
  out: ProfileOutput,
  opts: { pinned: string[]; muted: string[]; enabled: Category[]; inputHash: string; previousVersion?: number },
): InterestProfile {
  const muted = opts.muted.map((m) => m.toLowerCase());
  let topics = out.topics
    .filter((t) => !containsAny(t.name, muted))
    .map((t) => ({
      name: t.name.trim(),
      weight: clamp(Number.isFinite(t.weight) ? t.weight : 0.5, 0.05, 1),
      keywords: uniq(t.keywords.map((k) => k.trim()).filter(Boolean)).slice(0, 10),
      zhKeywords: uniq((t.zhKeywords ?? []).map((k) => k.trim()).filter(Boolean)).slice(0, 8),
    }));
  for (const p of opts.pinned) {
    const existing = topics.find((t) => t.name.toLowerCase() === p.toLowerCase());
    if (existing) existing.weight = Math.max(existing.weight, 0.9);
    else topics.push({ name: p, weight: 0.9, keywords: [p], zhKeywords: [] });
  }
  topics = topics.sort((a, b) => b.weight - a.weight).slice(0, 14);

  const e = out.entities ?? {};
  const profile: InterestProfile = {
    summary: out.summary.trim(),
    person: {
      name: out.person?.name?.trim() || undefined,
      aliases: out.person?.aliases ?? [],
      roles: out.person?.roles ?? [],
      affiliations: out.person?.affiliations ?? [],
      location: out.person?.location?.trim() || undefined,
    },
    topics,
    entities: {
      people: uniq(e.people ?? []).slice(0, 25),
      organizations: uniq(e.organizations ?? []).slice(0, 25),
      companies: uniq(e.companies ?? []).slice(0, 25),
      venues: uniq(e.venues ?? []).slice(0, 20),
      products: uniq(e.products ?? []).slice(0, 20),
    },
    queries: [],
    languages: uniq((out.languages ?? []).filter((l): l is "en" | "zh" => l === "en" || l === "zh")),
    exclusions: uniq([...(out.exclusions ?? []), ...opts.muted]),
    inputHash: opts.inputHash,
    updatedAt: new Date().toISOString(),
    version: (opts.previousVersion ?? 0) + 1,
  };
  if (!profile.languages.length) profile.languages = ["en"];

  let queries: SearchQuery[] = out.queries
    .map((q) => ({
      category: (isCategory(q.category) ? q.category : "other") as Category,
      query: q.query.replace(/\bsite:\S+/gi, "").replace(/\s+/g, " ").trim(),
      lang: (q.lang === "zh" || hasCJK(q.query) ? "zh" : "en") as "en" | "zh",
    }))
    .filter((q) => q.query.length >= 2 && opts.enabled.includes(q.category) && !containsAny(q.query, muted));
  for (const p of opts.pinned) {
    if (!queries.some((q) => q.query.toLowerCase().includes(p.toLowerCase()))) {
      queries.push({ category: "news", query: p, lang: "en" }, { category: "paper", query: p, lang: "en" });
    }
  }
  for (const c of opts.enabled) {
    if (!queries.some((q) => q.category === c)) queries.push(...fallbackQueries(profile, c));
  }
  queries = uniqBy(queries, (q) => `${q.category}|${q.query.toLowerCase()}`).filter((q) => opts.enabled.includes(q.category));
  profile.queries = queries.slice(0, 48);
  if (opts.enabled.includes("wechat") && !profile.languages.includes("zh")) profile.languages.push("zh");
  return profile;
}

/** Stage 2: build or update the interest profile, then resolve the OpenAlex author for citation tracking. */
export async function profileStage(ctx: StageContext): Promise<StageResult> {
  const { profile, store } = ctx;
  const prefs = profile.preferences;
  const snapshots = (ctx.run.state.snapshots ?? []).filter((s) => s.status === "ok");
  const feedback = await store.listFeedback(profile.id, 40);
  const enabled = CATEGORIES.filter((c) => prefs.categories[c] !== false);

  const inputHash = sha1(
    JSON.stringify({
      v: PROFILE_VERSION,
      sources: snapshots.map((s) => [s.url, s.hash]).sort(),
      prefs: { pinned: prefs.pinnedTopics, muted: prefs.mutedTopics, notes: prefs.notes, enabled, author: prefs.openalexAuthorId },
      feedback: feedback.map((f) => [f.itemId, f.signal]),
    }),
  );

  const previous = profile.interest;
  const ageDays = previous ? (Date.now() - new Date(previous.updatedAt).getTime()) / 86400000 : Infinity;
  let interest: InterestProfile;

  if (previous && (previous.inputHash === inputHash || !snapshots.length) && ageDays < REUSE_MAX_AGE_DAYS) {
    interest = previous;
    ctx.run.state.profileReused = true;
    ctx.log("info", "Reference sources unchanged; reusing the current interest profile.");
  } else {
    await ctx.detail("Analyzing your sources with the language model");
    const budget = Math.floor(42000 / Math.max(1, snapshots.length));
    const documents = snapshots.map((s) => ({ url: s.url, title: s.title, text: truncate(s.text, Math.min(9000, budget)) }));
    const out = await completeJSON(
      ctx.llm(),
      {
        purpose: "profile",
        deadlineAt: ctx.deadline.at(10000),
        temperature: 0.2,
        maxTokens: 6000,
        messages: [
          { role: "system", content: PROFILE_SYSTEM },
          {
            role: "user",
            content: profilePrompt({
              today: isoDay(new Date()),
              documents,
              previous,
              pinnedTopics: prefs.pinnedTopics,
              mutedTopics: prefs.mutedTopics,
              notes: prefs.notes,
              enabledCategories: enabled,
              feedback: feedback.map((f) => ({ title: f.itemTitle, category: f.category, signal: f.signal })),
            }),
          },
        ],
        mockContext: { documents, enabled },
      },
      ProfileSchema,
    );
    interest = normalizeProfile(out, {
      pinned: prefs.pinnedTopics,
      muted: prefs.mutedTopics,
      enabled,
      inputHash,
      previousVersion: previous?.version,
    });
    interest.scholar = previous?.scholar;
    ctx.log("info", `Interest profile v${interest.version}: ${interest.topics.length} topics, ${interest.queries.length} queries.`);
  }

  // OpenAlex author resolution (enables "cites your work" and co-author tracking).
  const forcedChanged = Boolean(prefs.openalexAuthorId && interest.scholar?.openalexAuthorId !== prefs.openalexAuthorId);
  const needsResolve = enabled.includes("paper") && (!interest.scholar || forcedChanged || !ctx.run.state.profileReused);
  if (needsResolve && !config.mockMode && !ctx.deadline.expired(60000)) {
    await ctx.detail("Matching you to your publication record");
    const hints = snapshots.map((s) => s.hints ?? {});
    try {
      const res = await resolveAuthor({
        forcedId: prefs.openalexAuthorId,
        orcid: hints.find((h) => h.orcid)?.orcid,
        name: interest.person.name ?? hints.find((h) => h.scholarName)?.scholarName,
        affiliations: [...(interest.person.affiliations ?? []), ...hints.map((h) => h.scholarAffiliation ?? "").filter(Boolean)],
        paperTitles: hints.flatMap((h) => h.paperTitles ?? []),
      });
      interest.scholar = res;
      if (res.note) ctx.log("warn", res.note);
      else if (res.openalexAuthorId) ctx.log("info", `Matched OpenAlex author ${res.displayName} (${res.confidence} confidence).`);
    } catch (e) {
      ctx.log("warn", `OpenAlex author lookup failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  ctx.run.state.interest = interest;
  profile.interest = interest;
  profile.updatedAt = new Date().toISOString();
  await store.saveProfile(profile);
  await ctx.detail(`${interest.topics.length} topics · ${interest.queries.length} search queries`);
  return { done: true };
}
