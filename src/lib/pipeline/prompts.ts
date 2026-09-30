import { CATEGORIES, CATEGORY_META, type Category, type InterestProfile, type Lang } from "../types";

const CATEGORY_GUIDE = CATEGORIES.map((c) => `- ${c}: ${CATEGORY_META[c].label}`).join("\n");

export const PROFILE_SYSTEM = `You are a senior research-intelligence analyst. You build structured interest profiles that drive a personalized weekly intelligence briefing.
Rules:
- Use ONLY information present in the provided documents, preferences and feedback. Never invent affiliations, roles, projects or names.
- If something is unknown, leave it empty rather than guessing.
- Reply with a single JSON object and nothing else.`;

export function profilePrompt(input: {
  today: string;
  documents: { url: string; title?: string; text: string }[];
  previous?: InterestProfile | null;
  pinnedTopics: string[];
  mutedTopics: string[];
  notes: string;
  enabledCategories: Category[];
  feedback: { title: string; category: string; signal: 1 | -1 }[];
}): string {
  const docs = input.documents
    .map((d, i) => `<document index="${i + 1}" url="${d.url}"${d.title ? ` title="${d.title.replace(/"/g, "'")}"` : ""}>\n${d.text}\n</document>`)
    .join("\n\n");
  const prev = input.previous
    ? JSON.stringify({ summary: input.previous.summary, topics: input.previous.topics.map((t) => ({ name: t.name, weight: t.weight })) })
    : "none";
  const liked = input.feedback.filter((f) => f.signal > 0).map((f) => `+ [${f.category}] ${f.title}`);
  const disliked = input.feedback.filter((f) => f.signal < 0).map((f) => `- [${f.category}] ${f.title}`);
  return `Today is ${input.today}. Build or update the interest profile of the person described by these reference sources.

${docs}

Previous profile (update it; keep what is still supported): ${prev}
Pinned topics (must be included with high weight): ${input.pinnedTopics.join("; ") || "none"}
Muted topics (must be excluded and listed in exclusions): ${input.mutedTopics.join("; ") || "none"}
User notes: ${input.notes || "none"}
Reader feedback on past briefing items (upweight themes they liked, downweight disliked):
${[...liked, ...disliked].join("\n") || "none"}

Categories:
${CATEGORY_GUIDE}
Enabled categories: ${input.enabledCategories.join(", ")}

Return JSON with this shape:
{
  "summary": "2-3 sentences describing the person's work and what they would want to track",
  "person": { "name": "", "aliases": [], "roles": [], "affiliations": [], "location": "" },
  "topics": [ { "name": "", "weight": 0.0, "keywords": ["3-8 precise English search terms"], "zhKeywords": ["Chinese terms if useful"] } ],
  "entities": { "people": [], "organizations": [], "companies": [], "venues": [], "products": [] },
  "queries": [ { "category": "paper", "query": "", "lang": "en" } ],
  "languages": ["en"],
  "exclusions": []
}

Guidance:
- 5-12 topics, weights 0-1 (1 = core focus). Prefer specific technical terms over generic ones.
- entities.people: collaborators, advisors, notable peers explicitly named in the documents. venues: conferences/journals they publish in or attend.
- queries: 24-40 concise search-engine queries (2-7 words), covering every enabled category at least once.
  * Do not add dates, "latest", "2026", "news" boilerplate or site: operators; the system adds 7-day and domain filters.
  * paper: technical topic phrases. news/product/funding: topic + entity phrasing (e.g. "<company> funding round", "<technique> startup raises").
  * event: conference/workshop names relevant to the person. job: "postdoc <topic>", "<topic> scientist hiring", "faculty position <field>".
  * patent: technical phrases as they would appear in patent claims.
  * wechat: Chinese-language queries (lang "zh") about the same topics, e.g. "脂质组学 新方法".
  * people: names of key people/labs/organizations from the documents.
- Use lang "zh" for Chinese queries, "en" otherwise. Include "zh" in languages when the person's context is Chinese or WeChat is enabled.`;
}

export const CLUSTER_SYSTEM = `You are the chief editor of a personalized weekly intelligence briefing. You group raw search results into distinct stories and rate each story for one specific reader.
Rules:
- Judge only from the provided titles, snippets and metadata. Do not assume facts not shown.
- Be strict: generic, promotional, off-topic, or low-information items should get low scores or be left out.
- Reply with a single JSON object and nothing else.`;

export function clusterPrompt(input: {
  today: string;
  windowLabel: string;
  profile: InterestProfile;
  candidates: string;
  previouslyCovered: string[];
  enabledCategories: Category[];
}): string {
  const topics = input.profile.topics.map((t) => `${t.name} (${t.weight.toFixed(2)})`).join("; ");
  return `Today is ${input.today}. Coverage window: ${input.windowLabel}.

Reader profile: ${input.profile.summary}
Topics (weight): ${topics}
Key entities: ${[...input.profile.entities.people, ...input.profile.entities.organizations, ...input.profile.entities.companies].slice(0, 30).join("; ") || "none"}
Exclusions: ${input.profile.exclusions.join("; ") || "none"}

Stories already covered in recent editions (treat repeats as low novelty unless there is a genuinely new development):
${input.previouslyCovered.map((t) => `- ${t}`).join("\n") || "none"}

Candidates (id | category hint | date | source | signals | title — snippet):
${input.candidates}

Task:
1. Group candidates that report the same story, paper, event, launch or development into one cluster (a cluster may hold one or many ids; each id at most once).
2. For every cluster worth considering (aim for 15-30 clusters; omit clearly irrelevant items), assign:
   - category: one of ${input.enabledCategories.join(", ")}
   - label: short neutral description of the story
   - relevance: 0-10, fit with the reader's topics and entities
   - impact: 0-10, significance for the field/industry
   - novelty: 0-10, how new this is (repeats of covered stories score low)
   - credibility: 0-10, reliability of the sources shown
   - value: 0-10, practical value to this reader (could they act on it, cite it, apply, attend, contact?)
   - rationale: one sentence explaining the scores, referring to the reader's interests
Signals: "cites-your-work" = the paper cites the reader's publications; "coauthor" = written by a frequent co-author; "your-work" = the reader's own new publication. These are usually high value.

Return JSON: {"clusters":[{"ids":["c1","c7"],"category":"news","label":"","relevance":0,"impact":0,"novelty":0,"credibility":0,"value":0,"rationale":""}]}`;
}

export const SYNTH_SYSTEM = `You are the editor of a premium, personalized intelligence briefing (think Apple News quality, analyst rigor).
Non-negotiable rules:
- Every factual statement must be supported by the numbered sources provided and must carry citation markers like [S1] or [S1][S3].
- Never invent facts, numbers, names, dates, quotes, links or sources. If the sources are thin, write less.
- Numbers must be copied exactly as they appear in the sources.
- Distinguish reported facts from your interpretation. Interpretation (why it matters, analysis) must still cite the facts it builds on.
- If sources disagree, say so and cite both.
- Reply with a single JSON object and nothing else.`;

export function synthPrompt(input: {
  today: string;
  outputLanguage: Lang;
  profileSummary: string;
  topics: string;
  category: Category;
  label: string;
  rationale: string;
  sources: string;
}): string {
  const lang = input.outputLanguage === "zh" ? "Simplified Chinese" : "English";
  return `Today is ${input.today}. Write one briefing item in ${lang}.

Reader: ${input.profileSummary}
Reader topics: ${input.topics}
Story: ${input.label} (category: ${input.category})
Editor's note on why it was selected: ${input.rationale}

Sources:
${input.sources}

Return JSON:
{
  "title": "clear factual headline, max 90 characters, no clickbait, no citation markers",
  "category": "${input.category}",
  "summary": "2-3 sentences on what happened, with citation markers",
  "whyItMatters": "1-2 sentences tailored to this reader's work, with citation markers for any facts",
  "keyFacts": [ { "text": "one verifiable fact, no markers inside", "sources": ["S1"] } ],
  "analysis": [ { "heading": "short heading", "body": "a paragraph of deeper analysis with citation markers" } ],
  "relevanceExplanation": "1-2 sentences on why this ranks in the reader's top 10 (relevance, impact, novelty, credibility, value)",
  "confidence": "high | medium | low (how well the sources support the story)"
}
Constraints: 3-5 keyFacts; 2-4 analysis paragraphs; only use source ids that exist above.`;
}

export const EDITION_SYSTEM = `You write the cover of a personalized weekly intelligence briefing. You summarize ONLY the items provided; you add no new facts. Reply with a single JSON object and nothing else.`;

export function editionPrompt(input: { outputLanguage: Lang; windowLabel: string; items: string }): string {
  const lang = input.outputLanguage === "zh" ? "Simplified Chinese" : "English";
  return `Write the cover for this week's edition in ${lang}. Window: ${input.windowLabel}.

Items (number. [category] title — summary):
${input.items}

Return JSON:
{
  "headline": "an editorial headline for the week, max 70 characters, grounded in the items",
  "dek": "2-3 sentence overview referencing items by number in brackets like [1] [4]; no facts beyond the items",
  "themes": ["2-5 short theme labels"]
}`;
}
