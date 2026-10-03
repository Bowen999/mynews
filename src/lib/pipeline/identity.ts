import { config } from "../config";
import { resolveS2Author } from "../search/semanticscholar";
import type { ScholarIdentity, SourceSnapshot } from "../types";

type Hints = NonNullable<SourceSnapshot["hints"]>;

/** Google Scholar side: the profile id and the citation clusters of the most-cited papers. */
export function scholarFromHints(hints: Hints[]): { scholarUserId?: string; citesIds: string[]; titles: string[] } {
  const papers = hints.flatMap((h) => h.scholarPapers ?? []);
  const citesIds = [...papers]
    .filter((p) => p.citesId)
    .sort((a, b) => (b.citedBy ?? 0) - (a.citedBy ?? 0))
    .map((p) => p.citesId!)
    .filter((id, i, all) => all.indexOf(id) === i)
    .slice(0, 3);
  const titles = [
    ...[...papers].sort((a, b) => (b.citedBy ?? 0) - (a.citedBy ?? 0)).map((p) => p.title),
    ...hints.flatMap((h) => h.paperTitles ?? []),
  ].filter((t, i, all) => t && all.indexOf(t) === i);
  return { scholarUserId: hints.find((h) => h.scholarUserId)?.scholarUserId, citesIds, titles };
}

/**
 * An earlier version kept the papers and co-authors of a weak (low-confidence) Semantic Scholar match, and
 * embedded their titles as "your work". They are not necessarily this person's: drop them and use the
 * titles from the person's own pages instead.
 */
export function withoutWeakMatchData(s: ScholarIdentity | undefined, ownTitles: string[]): ScholarIdentity | undefined {
  if (!s || s.confidence !== "low" || !s.s2AuthorId) return s;
  if (!s.paperIds?.length && !s.coauthorIds?.length) return s;
  return { ...s, paperIds: [], coauthorIds: [], coauthorNames: [], paperTitles: ownTitles.slice(0, 18) };
}

/**
 * Work out who the person is in scholarly indexes: Google Scholar ids come from their profile page,
 * the Semantic Scholar author from an explicit id, their own paper titles, or name + affiliation.
 */
export async function resolveIdentity(input: {
  forcedS2Id?: string;
  name?: string;
  affiliations: string[];
  hints: Hints[];
  deadlineAt: number;
}): Promise<ScholarIdentity> {
  const gs = scholarFromHints(input.hints);
  const resolvedAt = new Date().toISOString();
  if (config.mockMode) {
    return {
      s2AuthorId: "mock-author",
      displayName: input.name,
      confidence: "high",
      paperIds: ["mock-p1", "mock-p2"],
      paperTitles: gs.titles.slice(0, 12),
      coauthorIds: ["mock-coauthor"],
      coauthorNames: ["Daniel Okafor"],
      scholarUserId: gs.scholarUserId,
      citesIds: gs.citesIds.length ? gs.citesIds : ["1001"],
      resolvedAt,
    };
  }
  const notes: string[] = [];
  let s2: Awaited<ReturnType<typeof resolveS2Author>> | undefined;
  try {
    s2 = await resolveS2Author({
      forcedId: input.forcedS2Id,
      name: input.name,
      affiliations: input.affiliations,
      paperTitles: gs.titles,
      deadlineAt: input.deadlineAt,
    });
    if (s2.note) notes.push(s2.note);
  } catch (e) {
    notes.push(`Semantic Scholar lookup failed: ${e instanceof Error ? e.message : String(e)}`);
  }
  return {
    s2AuthorId: s2?.s2AuthorId,
    displayName: s2?.displayName ?? input.name,
    confidence: s2?.s2AuthorId ? s2.confidence : gs.citesIds.length ? "medium" : "low",
    paperIds: s2?.paperIds ?? [],
    // Embedded as "your work", so only titles that are surely theirs: a weak match has none (see resolveS2Author).
    paperTitles: (s2?.paperTitles.length ? s2.paperTitles : gs.titles).slice(0, 18),
    coauthorIds: s2?.coauthorIds ?? [],
    coauthorNames: s2?.coauthorNames ?? [],
    scholarUserId: gs.scholarUserId,
    citesIds: gs.citesIds,
    note: notes.join(" ") || undefined,
    resolvedAt,
  };
}
