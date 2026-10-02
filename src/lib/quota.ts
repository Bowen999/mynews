import type { AuthUser } from "./auth/types";
import { config } from "./config";
import type { Store } from "./store";
import type { Profile } from "./types";

const DAY = 86400e3;

export interface QuotaStatus {
  allowed: boolean;
  /** Generations used in the rolling 7-day window. */
  used: number;
  /** Per-user weekly limit, or null when unlimited (admins, or limit disabled). */
  limit: number | null;
  /** When the oldest counted generation leaves the window. */
  nextSlotAt?: string;
  reason?: string;
}

/** Rolling-window usage limits that protect the owner's API credits. Admins are exempt. */
export async function checkQuota(user: AuthUser, profile: Profile, store: Store, now = Date.now()): Promise<QuotaStatus> {
  const weekAgo = new Date(now - 7 * DAY).toISOString();
  const recent = (await store.listRuns(profile.id, 100)).filter((r) => r.createdAt >= weekAgo);
  const used = recent.length;
  if (user.isAdmin) return { allowed: true, used, limit: null };

  const limit = config.limits.userWeekly || null;
  if (limit !== null && used >= limit) {
    const oldest = recent.map((r) => r.createdAt).sort()[0];
    const nextSlotAt = oldest ? new Date(new Date(oldest).getTime() + 7 * DAY).toISOString() : undefined;
    return {
      allowed: false,
      used,
      limit,
      nextSlotAt,
      reason: `You have used ${used} of ${limit} briefings this week.`,
    };
  }

  const globalLimit = config.limits.globalDaily;
  if (globalLimit) {
    const today = await store.countRunsSince(new Date(now - DAY).toISOString());
    if (today >= globalLimit) {
      return { allowed: false, used, limit, reason: "The service has reached its daily generation limit. Try again tomorrow." };
    }
  }
  return { allowed: true, used, limit };
}
