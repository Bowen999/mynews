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
    /** Google Scholar user id and the "Cited by" cluster ids of the listed papers. */
    scholarUserId?: string;
    scholarPapers?: ScholarPaper[];
  };
}

export interface ScholarPaper {
  title: string;
  /** Google Scholar citation cluster id (the `cites=` parameter of the "Cited by" link). */
  citesId?: string;
  citedBy?: number;
  year?: number;
}

/** Who the person is in scholarly indexes, used for "cites your work", co-author and recommendation searches. */
export interface ScholarIdentity {
  /** Semantic Scholar author id. */
  s2AuthorId?: string;
  displayName?: string;
  confidence?: "high" | "medium" | "low";
  /** Semantic Scholar ids of the person's papers (most cited first). */
  paperIds?: string[];
  /** Titles of the person's papers; embedded as "your work" prototypes. */
  paperTitles?: string[];
  /** Semantic Scholar ids of frequent co-authors. */
  coauthorIds?: string[];
  coauthorNames?: string[];
  /** Google Scholar profile id and citation cluster ids of the most-cited papers. */
  scholarUserId?: string;
  citesIds?: string[];
  note?: string;
  resolvedAt?: string;
}

/** An embedded reference point for semantic ranking ("topic", "your paper", "muted"…). */
export interface Prototype {
  kind: "topic" | "work" | "negative";
  label: string;
  weight: number;
  /** int8-quantized, base64-encoded unit vector. */
  v: string;
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
  /** Scholarly identity (Semantic Scholar + Google Scholar); optional and may be ambiguous. */
  scholar?: ScholarIdentity;
  /** Embedded topics, own papers and muted topics for semantic ranking (absent without an embedder). */
  prototypes?: { model: string; hash: string; items: Prototype[] };
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
  /** Force a specific Semantic Scholar author id when auto-resolution is ambiguous. */
  semanticScholarAuthorId?: string;
  /** Names to track exactly (people, companies, grants, products). */
  watchTerms: string[];
  /** RSS/Atom feeds to read every week (lab news, journal TOCs, blogs). */
  watchFeeds: string[];
  /** Personal ntfy topic (name or full URL) for this account's notifications. */
  ntfyTopic?: string;
}

export function defaultPreferences(): Preferences {
  const categories = Object.fromEntries(CATEGORIES.map((c) => [c, true])) as Record<Category, boolean>;
  return { outputLanguage: "en", categories, pinnedTopics: [], mutedTopics: [], notes: "", watchTerms: [], watchFeeds: [] };
}

export interface Profile {
  id: string;
  /** Account that owns this profile (auth user id). */
  ownerId?: string | null;
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
  /** Semantic Scholar paper id (lets liked papers seed recommendations). */
  paperId?: string;
  /** Embedding of title + snippet (int8 base64), when an embedder is configured. */
  embedding?: string;
  /** Best semantic match with the reader's prototypes, 0..1, and what it matched. */
  semantic?: number;
  matched?: string;
  /** Watchlist terms found in the text. */
  watch?: string[];
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
  /** Centroid of the members' embeddings (int8 base64). */
  embedding?: string;
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
  paperId?: string;
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
  /** Story centroid embedding (int8 base64); used for novelty against later editions and feedback learning. */
  embedding?: string;
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
  /** Candidates were scored with embeddings. */
  semantic?: boolean;
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
  /** Where notifications for this run go (resolved when the run starts). */
  notify?: { topics: string[]; ownerAlerts: boolean };
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

/** Implicit feedback: a story page was opened or one of its sources was clicked. */
export interface Interaction {
  id: string;
  profileId: string;
  editionId: string;
  itemId: string;
  category: Category;
  kind: "open" | "source";
  createdAt: string;
}

export interface SystemStatus {
  llm: string;
  search: string[];
  scholarly: string[];
  embeddings: string;
  storage: "supabase" | "file";
  ntfyTopic: string;
  advisories: string[];
  problems: RequiredInput[];
}
