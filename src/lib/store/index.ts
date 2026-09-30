import path from "node:path";
import { config, hasSupabase } from "../config";
import { defaultPreferences, type Profile } from "../types";
import { FileStore } from "./file";
import { SupabaseStore } from "./supabase";
import type { Store } from "./types";

export type { Store } from "./types";

export const DEFAULT_PROFILE_ID = "default";

let cached: Store | undefined;

export function getStore(): Store {
  if (cached) return cached;
  if (hasSupabase()) {
    cached = new SupabaseStore(config.store.supabaseUrl!, config.store.supabaseKey!);
  } else {
    const dir = config.onVercel ? "/tmp/mynews-data" : path.resolve(/*turbopackIgnore: true*/ process.cwd(), config.store.dataDir);
    cached = new FileStore(dir);
  }
  return cached;
}

/** Load the single default profile, creating an empty one on first use. */
export async function loadProfile(store = getStore()): Promise<Profile> {
  const existing = await store.getProfile(DEFAULT_PROFILE_ID);
  if (existing) {
    // Backfill preference keys added in later versions.
    const defaults = defaultPreferences();
    existing.preferences = {
      ...defaults,
      ...existing.preferences,
      categories: { ...defaults.categories, ...(existing.preferences?.categories ?? {}) },
    };
    return existing;
  }
  const now = new Date().toISOString();
  const profile: Profile = {
    id: DEFAULT_PROFILE_ID,
    name: "My briefing",
    sources: [],
    interest: null,
    preferences: defaultPreferences(),
    createdAt: now,
    updatedAt: now,
  };
  await store.saveProfile(profile);
  return profile;
}
