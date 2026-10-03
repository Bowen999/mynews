import { profileForUser } from "./accounts";
import type { AuthUser } from "./auth";
import { configurationProblems } from "./config";
import { databaseProblem } from "./pipeline/runner";
import { getStore } from "./store";
import type { RequiredInput } from "./types";

/** What the front page needs for the signed-in account: its latest edition, any unfinished run, and blocking problems. */
export async function loadDashboard(user: AuthUser) {
  const problems: RequiredInput[] = configurationProblems().filter((p) => p.key !== "SUPABASE_AUTH");
  if (problems.some((p) => p.key === "SUPABASE")) return { problems, data: null };
  try {
    const store = getStore();
    const profile = await profileForUser(user, store);
    const [[latest], runs] = await Promise.all([store.listEditions(profile.id, 1), store.listRuns(profile.id, 5)]);
    const unfinished =
      runs.find(
        (r) => r.status !== "completed" && Date.now() - new Date(r.updatedAt).getTime() < 24 * 3600e3 && (!latest || r.createdAt > latest.createdAt),
      ) ?? null;
    return { problems, data: { profile, latest: latest ?? null, unfinished } };
  } catch (e) {
    return { problems: [...problems, databaseProblem(e)], data: null };
  }
}
