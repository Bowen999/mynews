// Core domain types shared by the pipeline, storage layer and UI.

export const CATEGORIES = [
  "paper",
  "news",
  "funding",
  "event",
  "wechat",
  "patent",
  "job",
  "product",
  "people",
  "other",
] as const;

export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_META: Record<Category, { label: string; short: string; tone: string }> = {
  paper: { label: "Research", short: "Paper", tone: "indigo" },
  news: { label: "News", short: "News", tone: "red" },
  funding: { label: "Companies & Funding", short: "Funding", tone: "green" },
  event: { label: "Conferences & Events", short: "Event", tone: "orange" },
  wechat: { label: "WeChat / 公众号", short: "WeChat", tone: "teal" },
  patent: { label: "Patents", short: "Patent", tone: "brown" },
  job: { label: "Jobs & Recruiting", short: "Jobs", tone: "purple" },
  product: { label: "Product Launches", short: "Launch", tone: "blue" },
  people: { label: "People & Labs", short: "People", tone: "pink" },
  other: { label: "Worth Knowing", short: "Other", tone: "gray" },
};

export function isCategory(v: unknown): v is Category {
  return typeof v === "string" && (CATEGORIES as readonly string[]).includes(v);
}

export type Lang = "en" | "zh";

export interface ReferenceSource {
  id: string;
  url: string;
  label?: string;
  addedAt: string;
}

export interface SourceSnapshot {
  url: string;
  title?: string;
  text: string;
  fetchedAt: string;
  status: "ok" | "error";
  error?: string;
  via: "direct" | "jina" | "cache" | "none";
  hash: string;
  /** Structured hints detected while fetching (e.g. ORCID, Scholar name). */
  hints?: {
    orcid?: string;
    scholarName?: string;
    scholarAffiliation?: string;
    scholarInterests?: string[];
    paperTitles?: string[];
  };
}

export interface InterestTopic {
  name: string;
  weight: number; // 0..1
  keywords: string[];
  zhKeywords?: string[];
}

export interface SearchQuery {
  category: Category;
  query: string;
  lang: Lang;
}

export interface InterestProfile {
  summary: string;
  person: {
    name?: string;
    aliases?: string[];
    roles?: string[];
    affiliations?: string[];
    location?: string;
  };
  topics: InterestTopic[];
  entities: {
    people: string[];
    organizations: string[];
    companies: string[];
    venues: string[];
    products: string[];
  };
  queries: SearchQuery[];
  languages: Lang[];
  exclusions: string[];
  /** OpenAlex author resolution (optional, may be ambiguous). */
  scholar?: {
    openalexAuthorId?: string;
    displayName?: string;
    confidence?: "high" | "medium" | "low";
    topWorkIds?: string[];
    coauthorIds?: string[];
    note?: string;
  };
  /** Fingerprint of inputs used to build this profile (sources + prefs + feedback). */
  inputHash?: string;
  updatedAt: string;
  version: number;
}

export interface Preferences {
  outputLanguage: Lang;
  categories: Record<Category, boolean>;
  pinnedTopics: string[];
  mutedTopics: string[];
  notes: string;
  /** Force a specific OpenAlex author id (e.g. "A5023888391") when auto-resolution is ambiguous. */
  openalexAuthorId?: string;
}

export function defaultPreferences(): Preferences {
  const categories = Object.fromEntries(CATEGORIES.map((c) => [c, true])) as Record<Category, boolean>;
  return { outputLanguage: "en", categories, pinnedTopics: [], mutedTopics: [], notes: "" };
}

export interface Profile {
  id: string;
  name: string;
  sources: ReferenceSource[];
  interest: InterestProfile | null;
  preferences: Preferences;
  createdAt: string;
  updatedAt: string;
}

export type DateSource = "metadata" | "provider" | "page" | "unknown";

export interface Candidate {
  id: string;
  url: string;
  canonicalUrl: string;
  title: string;
  snippet: string;
  content?: string;
  publishedAt?: string;
  dateSource: DateSource;
  publisher?: string;
  domain: string;
  categoryHint?: Category;
  provider: string;
  query?: string;
  lang?: Lang;
  authors?: string[];
  venue?: string;
  doi?: string;
  imageUrl?: string;
  /** Personal signals, e.g. the paper cites the user's work or is by a co-author. */
  signals?: string[];
  prescore?: number;
  /** Other URLs merged into this candidate by exact/near-duplicate detection. */
  duplicates?: { url: string; publisher?: string; provider: string }[];
}

export interface ScoreBreakdown {
  relevance: number;
  impact: number;
  novelty: number;
  credibility: number;
  value: number;
}

export interface Cluster {
  id: string;
  candidateIds: string[];
  category: Category;
  label: string;
  scores: ScoreBreakdown;
  rationale: string;
  total?: number;
  adjustments?: string[];
}

export interface BriefingSource {
  id: string; // "S1"
  url: string;
  title: string;
  publisher?: string;
  domain: string;
  publishedAt?: string;
  dateSource: DateSource;
  provider: string;
}

export interface KeyFact {
  text: string;
  sources: string[];
}

export interface AnalysisBlock {
  heading?: string;
  body: string;
}

export interface BriefingItem {
  id: string;
  rank: number;
  category: Category;
  title: string;
  whyItMatters: string;
  summary: string;
  keyFacts: KeyFact[];
  analysis: AnalysisBlock[];
  relevance: {
    explanation: string;
    scores: ScoreBreakdown;
    total: number;
    adjustments: string[];
  };
  sources: BriefingSource[];
  dates: { earliest?: string; latest?: string };
  imageUrl?: string;
  confidence: "high" | "medium" | "low";
  verification: { checkedClaims: number; removedClaims: number; notes: string[] };
}

export interface AlsoNoted {
  title: string;
  url: string;
  publisher?: string;
  domain: string;
  publishedAt?: string;
  category: Category;
}

export interface EditionStats {
  queries: number;
  providers: string[];
  candidates: number;
  inWindow: number;
  clusters: number;
  durationMs: number;
  removedClaims: number;
}

export interface Edition {
  id: string;
  profileId: string;
  runId: string;
  number: number;
  headline: string;
  dek: string;
  themes: string[];
  windowStart: string;
  windowEnd: string;
  createdAt: string;
  items: BriefingItem[];
  alsoNoted: AlsoNoted[];
  stats: EditionStats;
  profileSummary: string;
  model: { provider: string; model: string };
  sample?: boolean;
}

export type EditionSummary = Pick<
  Edition,
  "id" | "number" | "headline" | "dek" | "windowStart" | "windowEnd" | "createdAt" | "themes" | "sample"
> & { itemCount: number; topCategories: Category[] };

export const STAGES = [
  { key: "sources", label: "Reading your reference sources" },
  { key: "profile", label: "Updating your interest profile" },
  { key: "search", label: "Searching the past 7 days" },
  { key: "collect", label: "Collecting and verifying candidates" },
  { key: "cluster", label: "Deduplicating and clustering" },
  { key: "rank", label: "Scoring and ranking" },
  { key: "synthesize", label: "Writing the briefing" },
  { key: "publish", label: "Publishing the edition" },
] as const;

export type StageKey = (typeof STAGES)[number]["key"];

export interface StageProgress {
  key: StageKey;
  status: "pending" | "active" | "done" | "failed";
  detail?: string;
  startedAt?: string;
  finishedAt?: string;
}

export interface RunLogEntry {
  at: string;
  level: "info" | "warn" | "error";
  message: string;
}

export interface RequiredInput {
  key: string;
  message: string;
  action?: string;
}

export interface RunState {
  snapshots?: SourceSnapshot[];
  interest?: InterestProfile;
  profileReused?: boolean;
  queriesRun?: number;
  providers?: string[];
  candidates?: Candidate[];
  rawCount?: number;
  clusters?: Cluster[];
  selected?: string[]; // cluster ids, ordered
  alsoNoted?: AlsoNoted[];
  items?: BriefingItem[];
  pendingSynthesis?: string[]; // cluster ids still to synthesize
}

export interface Run {
  id: string;
  profileId: string;
  status: "running" | "completed" | "failed" | "needs_input";
  stage: StageKey;
  progress: StageProgress[];
  log: RunLogEntry[];
  state: RunState;
  windowStart: string;
  windowEnd: string;
  baseUrl?: string;
  error?: string;
  editionId?: string;
  requiredInputs?: RequiredInput[];
  leaseUntil?: string | null;
  createdAt: string;
  updatedAt: string;
  finishedAt?: string;
}

export type RunSummary = Pick<
  Run,
  "id" | "status" | "stage" | "createdAt" | "updatedAt" | "windowStart" | "windowEnd" | "editionId" | "error"
>;

export interface Feedback {
  id: string;
  profileId: string;
  editionId: string;
  itemId: string;
  itemTitle: string;
  category: Category;
  signal: 1 | -1;
  createdAt: string;
}

export interface SystemStatus {
  llm: string;
  search: string[];
  scholarly: string[];
  storage: "supabase" | "file";
  ntfyTopic: string;
  advisories: string[];
  problems: RequiredInput[];
}
