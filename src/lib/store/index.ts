import path from "node:path";
import { config, hasSupabase } from "../config";
import { defaultPreferences, type Profile } from "../types";
import { FileStore } from "./file";
import { SupabaseStore } from "./supabase";
import type { Store } from "./types";

export type { Store } from "./types";

/** Profile id used by the earlier single-user version; an admin claims it on first sign-in. */
export const LEGACY_PROFILE_ID = "default";

let cached: Store | undefined;

/** Directory for the file store and local development accounts. */
export function localDataDir(): string {
  return config.onVercel ? "/tmp/mynews-data" : path.resolve(/*turbopackIgnore: true*/ process.cwd(), config.store.dataDir);
}

export function getStore(): Store {
  if (cached) return cached;
  cached = hasSupabase() ? new SupabaseStore(config.store.supabaseUrl!, config.store.supabaseKey!) : new FileStore(localDataDir());
  return cached;
}

/** Backfill preference keys added in later versions and drop retired ones. */
export function withPreferenceDefaults(profile: Profile): Profile {
  const defaults = defaultPreferences();
  const { openalexAuthorId: _retired, ...stored } = (profile.preferences ?? {}) as Profile["preferences"] & { openalexAuthorId?: string };
  void _retired;
  profile.preferences = {
    ...defaults,
    ...stored,
    categories: { ...defaults.categories, ...(stored.categories ?? {}) },
  };
  return profile;
}

/** Load a profile by id (used by the pipeline, which runs on behalf of the run's owner). */
export async function loadProfileById(id: string, store = getStore()): Promise<Profile | null> {
  const p = await store.getProfile(id);
  return p ? withPreferenceDefaults(p) : null;
}
