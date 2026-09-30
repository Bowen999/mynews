import { webSearchProviders } from "../config";
import type { SearchTask, TaskKind } from "../search/types";
import type { Category, InterestProfile, Preferences } from "../types";
import { shortHash, uniqBy } from "../util/text";

export const DOMAIN_FILTERS: Partial<Record<Category, string[]>> = {
  wechat: ["mp.weixin.qq.com"],
  patent: ["patents.google.com", "patents.justia.com", "freepatentsonline.com", "patentscope.wipo.int"],
};

const NEWS_CATEGORIES: Category[] = ["news", "funding", "product", "people"];

const MAX_TASKS = 44;

function kindFor(category: Category): TaskKind {
  return NEWS_CATEGORIES.includes(category) ? "news" : "web";
}

function task(kind: TaskKind, category: Category, query: string, lang: "en" | "zh", priority: number, extra: Partial<SearchTask> = {}): SearchTask {
  return { id: shortHash(`${kind}|${category}|${query}|${extra.openalexFilter ?? ""}`, 10), kind, category, query, lang, priority, ...extra };
}

/** Turn the interest profile into concrete, provider-routed search tasks for the 7-day window. */
export function planSearch(profile: InterestProfile, prefs: Preferences): SearchTask[] {
  const enabled = (c: Category) => prefs.categories[c] !== false;
  const hasWebApi = webSearchProviders().length > 0;
  const tasks: SearchTask[] = [];
  const topicWeight = (q: string) => {
    const lower = q.toLowerCase();
    const hit = profile.topics.find((t) => [t.name, ...t.keywords, ...(t.zhKeywords ?? [])].some((k) => k && lower.includes(k.toLowerCase())));
    return hit?.weight ?? 0.5;
  };

  profile.queries.forEach((q, i) => {
    if (!enabled(q.category)) return;
    const order = 1 - i / Math.max(1, profile.queries.length); // earlier queries matter more
    const priority = topicWeight(q.query) + order * 0.5;
    if (q.category === "paper") {
      tasks.push(task("openalex", "paper", q.query, q.lang, priority + 0.2));
      if (q.lang === "en") tasks.push(task("arxiv", "paper", q.query, "en", priority - 0.1));
      if (hasWebApi) tasks.push(task("web", "paper", q.query, q.lang, priority - 0.3));
      return;
    }
    tasks.push(task(kindFor(q.category), q.category, q.query, q.lang, priority, { includeDomains: DOMAIN_FILTERS[q.category] }));
  });

  // Personal scholarly signals from OpenAlex (free, high value).
  const s = profile.scholar;
  if (enabled("paper") && s?.openalexAuthorId && s.confidence !== "low") {
    if (s.topWorkIds?.length) {
      tasks.push(
        task("openalex", "paper", "New papers citing your work", "en", 3, {
          openalexFilter: `cites:${s.topWorkIds.slice(0, 40).join("|")}`,
          signal: "cites-your-work",
        }),
      );
    }
    tasks.push(
      task("openalex", "paper", "Your new publications", "en", 2.8, { openalexFilter: `author.id:${s.openalexAuthorId}`, signal: "your-work" }),
    );
    if (s.coauthorIds?.length) {
      tasks.push(
        task("openalex", "people", "New work by frequent co-authors", "en", 2.6, {
          openalexFilter: `author.id:${s.coauthorIds.slice(0, 15).join("|")}`,
          signal: "coauthor",
        }),
      );
    }
  }

  // Direct mentions of the person and key organizations.
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
