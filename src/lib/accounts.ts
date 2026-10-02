import type { AuthUser } from "./auth/types";
import { HttpError } from "./auth/types";
import { getStore, LEGACY_PROFILE_ID, withPreferenceDefaults, type Store } from "./store";
import { defaultPreferences, type Edition, type Profile, type Run } from "./types";

/**
 * The signed-in user's profile (one per account), created on first use. An admin signing in
 * for the first time adopts the profile left by the earlier single-user version.
 */
export async function profileForUser(user: AuthUser, store: Store = getStore()): Promise<Profile> {
  const existing = await store.getProfileByOwner(user.id);
  if (existing) return withPreferenceDefaults(existing);

  if (user.isAdmin) {
    const legacy = await store.getProfile(LEGACY_PROFILE_ID);
    if (legacy && !legacy.ownerId) {
      legacy.ownerId = user.id;
      legacy.updatedAt = new Date().toISOString();
      await store.saveProfile(legacy);
      return withPreferenceDefaults(legacy);
    }
  }

  const now = new Date().toISOString();
  const profile: Profile = {
    id: user.id,
    ownerId: user.id,
    name: user.email,
    sources: [],
    interest: null,
    preferences: defaultPreferences(),
    createdAt: now,
    updatedAt: now,
  };
  await store.saveProfile(profile);
  return profile;
}

/** Load a run that belongs to the user; other users' runs look like they do not exist. */
export async function ownedRun(user: AuthUser, runId: string, store: Store = getStore()): Promise<{ run: Run; profile: Profile }> {
  const [profile, run] = await Promise.all([profileForUser(user, store), store.getRun(runId)]);
  if (!run || run.profileId !== profile.id) throw new HttpError(404, "Run not found");
  return { run, profile };
}

export async function ownedEdition(user: AuthUser, editionId: string, store: Store = getStore()): Promise<{ edition: Edition; profile: Profile }> {
  const [profile, edition] = await Promise.all([profileForUser(user, store), store.getEdition(editionId)]);
  if (!edition || edition.profileId !== profile.id) throw new HttpError(404, "Edition not found");
  return { edition, profile };
}
