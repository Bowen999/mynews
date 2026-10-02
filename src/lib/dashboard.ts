import { profileForUser } from "./accounts";
import type { AuthUser } from "./auth";
import { configurationProblems } from "./config";
import { databaseProblem } from "./pipeline/runner";
import { getStore } from "./store";
import type { EditionSummary, RequiredInput } from "./types";

/** Latest edition, recent editions and any unfinished run for the signed-in account, plus blocking problems. */
export async function loadDashboard(user: AuthUser) {
  const problems: RequiredInput[] = configurationProblems().filter((p) => p.key !== "SUPABASE_AUTH");
  if (problems.some((p) => p.key === "SUPABASE")) return { problems, data: null };
  try {
    const store = getStore();
    const profile = await profileForUser(user, store);
    const [edition, recent, runs] = await Promise.all([
      store.getLatestEdition(profile.id),
      store.listEditions(profile.id, 4),
      store.listRuns(profile.id, 5),
    ]);
    const unfinished =
      runs.find(
        (r) => r.status !== "completed" && Date.now() - new Date(r.updatedAt).getTime() < 24 * 3600e3 && (!edition || r.createdAt > edition.createdAt),
      ) ?? null;
    const earlier: EditionSummary[] = recent.filter((e) => e.id !== edition?.id).slice(0, 3);
    return { problems, data: { profile, edition, earlier, unfinished } };
  } catch (e) {
    return { problems: [...problems, databaseProblem(e)], data: null };
  }
}
