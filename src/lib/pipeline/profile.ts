import { z } from "zod";
import { completeJSON } from "../llm/json";
import { getEmbedder } from "../embed";
import { CATEGORIES, FIELD_ENTITY_KINDS, isCategory, type Category, type FieldEntity, type FieldEntityKind, type InterestProfile, type SearchQuery } from "../types";
import { isoDay } from "../util/dates";
import { clamp, hasCJK, sha1, truncate, uniq, uniqBy } from "../util/text";
import type { StageContext, StageResult } from "./context";
import { resolveIdentity, scholarFromHints, withoutWeakMatchData } from "./identity";
import { PROFILE_SYSTEM, profilePrompt } from "./prompts";
import { ensurePrototypes } from "./semantic";

const PROFILE_VERSION = 5;
/** Re-resolve the scholarly identity at least this often (new papers, new co-authors). */
const IDENTITY_MAX_AGE_DAYS = 14;
const REUSE_MAX_AGE_DAYS = 14;

const str = z.string().catch("");
const strArr = z.array(z.string()).catch([]);

/** Lenient: a bare name or a partial object still counts; anything else becomes an empty entry that is dropped later. */
const FieldEntitySchema = z.preprocess(
  (v) => (typeof v === "string" ? { name: v } : v && typeof v === "object" ? v : {}),
  z.object({ name: str, kind: str, aliases: strArr, focus: str, weight: z.coerce.number().catch(0.6) }),
);

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
  fieldEntities: z.array(FieldEntitySchema).catch([]).optional(),
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

const MAX_FIELD_ENTITIES = 20;

function fieldKind(kind: string): FieldEntityKind {
  const k = kind.toLowerCase().trim();
  if ((FIELD_ENTITY_KINDS as readonly string[]).includes(k)) return k as FieldEntityKind;
  if (/invest|venture|\bvc\b/.test(k)) return "investor";
  if (/start/.test(k)) return "startup";
  if (/lab|institut|universit|academ/.test(k)) return "lab";
  return "company";
}

const cleanName = (s: string) => s.replace(/["“”]/g, "").replace(/\s+/g, " ").trim();

/** The model's picks of organizations to follow: muted ones removed, one entry per name, strongest first. */
export function normalizeFieldEntities(list: z.infer<typeof FieldEntitySchema>[], muted: string[]): FieldEntity[] {
  const out = list
    .map((e): FieldEntity => {
      const name = cleanName(e.name);
      const focus = cleanName(e.focus.replace(/\bsite:\S+/gi, "")).split(" ").slice(0, 6).join(" ");
      return {
        name,
        kind: fieldKind(e.kind),
        aliases: uniq(e.aliases.map(cleanName).filter((a) => a.length >= 2 && a.toLowerCase() !== name.toLowerCase())).slice(0, 4),
        focus: focus || undefined,
        weight: clamp(Number.isFinite(e.weight) ? e.weight : 0.6, 0.05, 1),
      };
    })
    .filter((e) => e.name.length >= 2 && e.name.length <= 80 && ![e.name, ...e.aliases].some((n) => containsAny(n, muted)));
  return uniqBy(out, (e) => e.name.toLowerCase())
    .sort((a, b) => b.weight - a.weight)
    .slice(0, MAX_FIELD_ENTITIES);
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
    fieldEntities: normalizeFieldEntities(out.fieldEntities ?? [], muted),
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

/** Stage 2: build or update the interest profile, resolve the scholarly identity, and embed the profile for semantic ranking. */
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
      prefs: { pinned: prefs.pinnedTopics, muted: prefs.mutedTopics, notes: prefs.notes, enabled, author: prefs.semanticScholarAuthorId },
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
    interest.prototypes = previous?.prototypes;
    ctx.log("info", `Interest profile v${interest.version}: ${interest.topics.length} topics, ${interest.queries.length} queries.`);
  }

  // Scholarly identity (Semantic Scholar + Google Scholar): enables "cites your work", co-author and recommendation searches.
  const hints = snapshots.map((s) => s.hints ?? {});
  interest.scholar = withoutWeakMatchData(interest.scholar, scholarFromHints(hints).titles);
  const scholar = interest.scholar;
  const identityAge = scholar?.resolvedAt ? (Date.now() - new Date(scholar.resolvedAt).getTime()) / 86400000 : Infinity;
  const forcedChanged = Boolean(prefs.semanticScholarAuthorId && scholar?.s2AuthorId !== prefs.semanticScholarAuthorId);
  const needsResolve =
    enabled.includes("paper") && (!scholar?.resolvedAt || forcedChanged || !ctx.run.state.profileReused || identityAge > IDENTITY_MAX_AGE_DAYS);
  if (needsResolve && !ctx.deadline.expired(60000)) {
    await ctx.detail("Matching you to your publication record");
    interest.scholar = await resolveIdentity({
      forcedS2Id: prefs.semanticScholarAuthorId,
      name: interest.person.name ?? hints.find((h) => h.scholarName)?.scholarName,
      affiliations: [...(interest.person.affiliations ?? []), ...hints.map((h) => h.scholarAffiliation ?? "").filter(Boolean)],
      hints,
      deadlineAt: ctx.deadline.at(45000),
    });
    const s = interest.scholar;
    if (s.note) ctx.log("warn", s.note);
    const n = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;
    if (s.s2AuthorId && s.confidence === "low") {
      ctx.log("info", `Not using Semantic Scholar author ${s.displayName ?? s.s2AuthorId}: too uncertain a match.`);
    } else if (s.s2AuthorId) {
      ctx.log("info", `Matched Semantic Scholar author ${s.displayName ?? s.s2AuthorId} (${s.confidence} confidence, ${n(s.paperIds?.length ?? 0, "paper")}, ${n(s.coauthorIds?.length ?? 0, "co-author")}).`);
    }
    if (s.citesIds?.length) ctx.log("info", `Tracking new Google Scholar citations of ${s.citesIds.length} of your most-cited papers.`);
  }

  // Embed topics, own papers, watch terms and muted topics once; reused until they change.
  const embedder = getEmbedder();
  if (embedder && !ctx.deadline.expired(30000)) {
    try {
      if (await ensurePrototypes(interest, prefs, embedder)) {
        ctx.log("info", `Embedded ${interest.prototypes?.items.length ?? 0} profile prototypes with ${embedder.model} for semantic ranking.`);
      }
    } catch (e) {
      ctx.log("warn", `Embedding the profile failed (${e instanceof Error ? e.message : String(e)}); ranking falls back to keywords.`);
    }
  }

  ctx.run.state.interest = interest;
  profile.interest = interest;
  profile.updatedAt = new Date().toISOString();
  await store.saveProfile(profile);
  await ctx.detail(`${interest.topics.length} topics · ${interest.queries.length} search queries`);
  return { done: true };
}
