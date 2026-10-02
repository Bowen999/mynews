import { config, webSearchProviders } from "../config";
import type { SearchTask, TaskKind } from "../search/types";
import type { Category, InterestProfile, Preferences } from "../types";
import { shortHash, uniqBy } from "../util/text";

export const DOMAIN_FILTERS: Partial<Record<Category, string[]>> = {
  wechat: ["mp.weixin.qq.com"],
  patent: ["patents.google.com", "patents.justia.com", "freepatentsonline.com", "patentscope.wipo.int"],
};

const NEWS_CATEGORIES: Category[] = ["news", "funding", "product", "people"];

const MAX_TASKS = 64;

/** Papers the reader liked or disliked in past editions (Semantic Scholar ids), used to steer recommendations. */
export interface PersonalSeeds {
  likedPaperIds: string[];
  dislikedPaperIds: string[];
}

function kindFor(category: Category): TaskKind {
  return NEWS_CATEGORIES.includes(category) ? "news" : "web";
}

function task(kind: TaskKind, category: Category, query: string, lang: "en" | "zh", priority: number, extra: Partial<SearchTask> = {}): SearchTask {
  const key = [kind, category, query, JSON.stringify(extra.s2 ?? ""), extra.scholarCites ?? "", extra.feedUrl ?? ""].join("|");
  return { id: shortHash(key, 10), kind, category, query, lang, priority, ...extra };
}

/** Turn the interest profile into concrete, provider-routed search tasks for the 7-day window. */
export function planSearch(profile: InterestProfile, prefs: Preferences, seeds: PersonalSeeds = { likedPaperIds: [], dislikedPaperIds: [] }): SearchTask[] {
  const enabled = (c: Category) => prefs.categories[c] !== false;
  const hasWebApi = webSearchProviders().length > 0;
  const scholarOn = config.search.googleScholar;
  const tasks: SearchTask[] = [];
  const topicWeight = (q: string) => {
    const lower = q.toLowerCase();
    const hit = profile.topics.find((t) => [t.name, ...t.keywords, ...(t.zhKeywords ?? [])].some((k) => k && lower.includes(k.toLowerCase())));
    return hit?.weight ?? 0.5;
  };

  let paperIndex = 0;
  profile.queries.forEach((q, i) => {
    if (!enabled(q.category)) return;
    const order = 1 - i / Math.max(1, profile.queries.length); // earlier queries matter more
    const priority = topicWeight(q.query) + order * 0.5;
    if (q.category === "paper") {
      tasks.push(task("s2", "paper", q.query, q.lang, priority + 0.2, { s2: { mode: "search" } }));
      tasks.push(task("europepmc", "paper", q.query, q.lang, priority + 0.1));
      if (q.lang === "en") tasks.push(task("arxiv", "paper", q.query, "en", priority - 0.1));
      if (scholarOn && paperIndex < 3) tasks.push(task("scholar", "paper", q.query, q.lang, priority - 0.2));
      if (hasWebApi && paperIndex < 4) tasks.push(task("web", "paper", q.query, q.lang, priority - 0.3));
      paperIndex++;
      return;
    }
    tasks.push(task(kindFor(q.category), q.category, q.query, q.lang, priority, { includeDomains: DOMAIN_FILTERS[q.category] }));
  });

  // Personal scholarly signals: your new papers, papers citing yours, co-authors' papers, recommendations.
  const s = profile.scholar;
  if (enabled("paper")) {
    const trusted = Boolean(s?.s2AuthorId && s.confidence !== "low");
    if (trusted && s?.s2AuthorId) {
      tasks.push(task("s2", "paper", "Your new publications", "en", 2.8, { s2: { mode: "author", authorId: s.s2AuthorId }, signal: "your-work" }));
      for (const paperId of (s.paperIds ?? []).slice(0, 5)) {
        tasks.push(task("s2", "paper", "New papers citing your work", "en", 3, { s2: { mode: "citations", paperId }, signal: "cites-your-work" }));
      }
      for (const authorId of (s.coauthorIds ?? []).slice(0, 6)) {
        tasks.push(task("s2", "paper", "New work by frequent co-authors", "en", 2.6, { s2: { mode: "author", authorId }, signal: "coauthor" }));
      }
    }
    const positive = [...(trusted ? (s?.paperIds ?? []).slice(0, 12) : []), ...seeds.likedPaperIds].slice(0, 30);
    if (positive.length) {
      tasks.push(
        task("s2", "paper", "Recommended from your papers and likes", "en", 2.7, {
          s2: { mode: "recommend", positive, negative: seeds.dislikedPaperIds.slice(0, 20) },
          signal: "recommended",
        }),
      );
    }
    if (scholarOn) {
      for (const cites of (s?.citesIds ?? []).slice(0, 3)) {
        tasks.push(task("scholar", "paper", "New papers citing your work (Google Scholar)", "en", 2.9, { scholarCites: cites, signal: "cites-your-work" }));
      }
    }
  }

  // Watchlist: exact names and feeds the reader asked to follow.
  for (const term of (prefs.watchTerms ?? []).slice(0, 8)) {
    tasks.push(task("news", "news", `"${term}"`, /[㐀-鿿]/.test(term) ? "zh" : "en", 2.2, { signal: "watchlist" }));
  }
  for (const feedUrl of (prefs.watchFeeds ?? []).slice(0, 10)) {
    tasks.push(task("feed", "other", feedUrl, "en", 2.5, { feedUrl, signal: "watchlist" }));
  }

  // Direct mentions of the person.
  if (enabled("people") && profile.person.name && profile.person.name.split(/\s+/).length >= 2) {
    tasks.push(task("news", "people", `"${profile.person.name}"`, "en", 2));
  }

  const unique = uniqBy(tasks, (t) => t.id).sort((a, b) => b.priority - a.priority);
  // Keep category balance: guarantee each category's best task before filling by priority.
  const picked: SearchTask[] = [];
  const seenCat = new Set<string>();
  for (const t of unique) {
    const key = `${t.category}|${t.kind}`;
    if (!seenCat.has(key)) {
      seenCat.add(key);
      picked.push(t);
    }
  }
  for (const t of unique) {
    if (picked.length >= MAX_TASKS) break;
    if (!picked.includes(t)) picked.push(t);
  }
  return picked.slice(0, MAX_TASKS);
}
