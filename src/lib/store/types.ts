import type { Edition, EditionSummary, Feedback, Interaction, Profile, Run, RunSummary, SourceSnapshot } from "../types";

/**
 * Slim rows for the admin pages: ids, times, statuses and counts, never briefing or profile content.
 * Runs, editions and profiles are complete; interactions and ratings only go back to `since`.
 */
export interface AdminSnapshot {
  profiles: { id: string; ownerId: string | null; createdAt: string; updatedAt: string; sources: number; interest: boolean; ntfy: boolean }[];
  runs: { id: string; profileId: string; status: Run["status"]; stage: Run["stage"]; createdAt: string; finishedAt?: string; error?: string; editionId?: string }[];
  editions: { id: string; profileId: string; number: number; createdAt: string; sample: boolean }[];
  /** Stories opened and source links followed. */
  interactions: { profileId: string; kind: Interaction["kind"]; at: string }[];
  /** Ratings given. */
  feedback: { profileId: string; signal: 1 | -1; at: string }[];
  /** A table was cut at the row limit, so its oldest rows are missing. */
  truncated: boolean;
}

export interface Store {
  readonly kind: "supabase" | "file";

  getProfile(id: string): Promise<Profile | null>;
  getProfileByOwner(ownerId: string): Promise<Profile | null>;
  saveProfile(profile: Profile): Promise<void>;

  getSnapshot(url: string): Promise<SourceSnapshot | null>;
  saveSnapshot(snapshot: SourceSnapshot): Promise<void>;

  createRun(run: Run): Promise<void>;
  getRun(id: string): Promise<Run | null>;
  /** Persist run fields (never touches the lease). */
  saveRun(run: Run): Promise<void>;
  /** Atomically take an exclusive lease so only one invocation advances a run at a time. */
  tryLease(runId: string, ms: number): Promise<boolean>;
  releaseLease(runId: string): Promise<void>;
  listRuns(profileId: string, limit: number): Promise<RunSummary[]>;
  /** Runs created since a time, for one profile or (without profileId) across all profiles. */
  countRunsSince(sinceIso: string, profileId?: string): Promise<number>;

  nextEditionNumber(profileId: string): Promise<number>;
  saveEdition(edition: Edition, standaloneHtml: string): Promise<void>;
  getEdition(id: string): Promise<Edition | null>;
  getLatestEdition(profileId: string): Promise<Edition | null>;
  listEditions(profileId: string, limit: number): Promise<EditionSummary[]>;
  recentEditions(profileId: string, limit: number): Promise<Edition[]>;
  getStandaloneHtml(id: string): Promise<string | null>;
  deleteEdition(id: string): Promise<void>;

  setFeedback(feedback: Feedback): Promise<void>;
  clearFeedback(editionId: string, itemId: string): Promise<void>;
  listFeedback(profileId: string, limit: number): Promise<Feedback[]>;
  feedbackForEdition(editionId: string): Promise<Feedback[]>;

  /** Implicit feedback (story opened, source clicked). Idempotent per interaction id. */
  addInteraction(interaction: Interaction): Promise<void>;
  listInteractions(profileId: string, limit: number): Promise<Interaction[]>;

  /** Everything the admin pages count, across all accounts. */
  adminSnapshot(since: string): Promise<AdminSnapshot>;
}

export function summarizeEdition(e: Edition): EditionSummary {
  const counts = new Map<string, number>();
  for (const it of e.items) counts.set(it.category, (counts.get(it.category) ?? 0) + 1);
  const topCategories = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c) as EditionSummary["topCategories"];
  return {
    id: e.id,
    number: e.number,
    headline: e.headline,
    dek: e.dek,
    windowStart: e.windowStart,
    windowEnd: e.windowEnd,
    createdAt: e.createdAt,
    themes: e.themes,
    sample: e.sample,
    itemCount: e.items.length,
    topCategories,
  };
}

export function summarizeRun(r: Run): RunSummary {
  return {
    id: r.id,
    status: r.status,
    stage: r.stage,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    windowStart: r.windowStart,
    windowEnd: r.windowEnd,
    editionId: r.editionId,
    error: r.error,
  };
}
