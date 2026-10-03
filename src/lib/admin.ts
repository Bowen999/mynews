import { cache } from "react";
import { listAccounts } from "./auth/directory";
import type { Account } from "./auth/types";
import { getStore } from "./store";
import type { AdminSnapshot } from "./store/types";
import type { Run } from "./types";

// What the admin pages show, worked out from slim rows (see AdminSnapshot) and the account list.
// Nothing here reads briefing content, reference sources or ratings text; only counts and times.

const DAY = 86400e3;
/** How far back the snapshot reads stories opened and ratings. */
export const EVENT_DAYS = 30;
export const CHART_DAYS = 30;

type SnapRun = AdminSnapshot["runs"][number];

const ms = (iso: string | undefined | null) => (iso ? Date.parse(iso) : NaN);
/** The latest of some times (0 when there are none). */
const latest = (...values: number[]) => values.reduce((m, v) => (Number.isFinite(v) && v > m ? v : m), 0);
const toIso = (t: number) => (t > 0 ? new Date(t).toISOString() : null);
const dayStart = (t: number) => Math.floor(t / DAY) * DAY;

export function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export interface UserRow {
  id: string;
  email: string;
  isAdmin: boolean;
  providers: string[];
  confirmed: boolean;
  createdAt: string;
  lastSignInAt?: string;
  /** The latest of sign-in, a generation, a story opened or a rating. */
  lastActiveAt: string | null;
  /** Reference sources added. */
  sources: number;
  hasProfile: boolean;
  /** An interest profile has been built. */
  interest: boolean;
  ntfy: boolean;
  editions: number;
  runs: number;
  runsWeek: number;
  failedMonth: number;
  lastRunAt: string | null;
  lastRunStatus: Run["status"] | null;
  /** Stories opened and ratings given in the last 30 days. */
  opens: number;
  liked: number;
  disliked: number;
}

export interface RunLine {
  id: string;
  at: string;
  status: Run["status"];
  stage: Run["stage"];
  /** The account's email; null when the account no longer exists. */
  email: string | null;
  /** For runs that finished. */
  durationMs: number | null;
  error?: string;
}

export interface DayBucket {
  /** UTC date, YYYY-MM-DD. */
  day: string;
  completed: number;
  failed: number;
  /** Still running or waiting for input. */
  other: number;
}

export interface FailureReason {
  message: string;
  count: number;
  users: number;
  last: string;
}

export interface Overview {
  users: { total: number; admins: number; newWeek: number; newMonth: number; activeWeek: number; neverGenerated: number };
  editions: { total: number; week: number };
  runs: { total: number; day: number; week: number; failedMonth: number; successRate: number | null; medianMs: number | null };
  /** Last 7 days. */
  reading: { opens: number; sourceClicks: number; liked: number; disliked: number };
  funnel: { signedUp: number; addedSources: number; gotEdition: number; opened: number };
  daily: DayBucket[];
  failures: FailureReason[];
  recent: RunLine[];
  truncated: boolean;
}

export interface UserDetail {
  user: UserRow;
  runs: RunLine[];
  editions: { number: number; createdAt: string; sample: boolean }[];
  quota: { used: number; limit: number | null };
}

interface Tally {
  runs: number;
  runsWeek: number;
  failedMonth: number;
  lastRunAt: number;
  lastRunStatus: Run["status"] | null;
  editions: number;
  opens: number;
  sourceClicks: number;
  liked: number;
  disliked: number;
  lastEventAt: number;
}

function tallies(snapshot: AdminSnapshot, now: number): Map<string, Tally> {
  const out = new Map<string, Tally>();
  const get = (profileId: string) => {
    let t = out.get(profileId);
    if (!t) out.set(profileId, (t = { runs: 0, runsWeek: 0, failedMonth: 0, lastRunAt: 0, lastRunStatus: null, editions: 0, opens: 0, sourceClicks: 0, liked: 0, disliked: 0, lastEventAt: 0 }));
    return t;
  };
  for (const r of snapshot.runs) {
    const t = get(r.profileId);
    const at = ms(r.createdAt);
    t.runs++;
    if (at >= now - 7 * DAY) t.runsWeek++;
    if (r.status === "failed" && at >= now - 30 * DAY) t.failedMonth++;
    if (at > t.lastRunAt) {
      t.lastRunAt = at;
      t.lastRunStatus = r.status;
    }
  }
  for (const e of snapshot.editions) get(e.profileId).editions++;
  for (const i of snapshot.interactions) {
    const t = get(i.profileId);
    if (i.kind === "open") t.opens++;
    else t.sourceClicks++;
    t.lastEventAt = latest(t.lastEventAt, ms(i.at));
  }
  for (const f of snapshot.feedback) {
    const t = get(f.profileId);
    if (f.signal === 1) t.liked++;
    else t.disliked++;
    t.lastEventAt = latest(t.lastEventAt, ms(f.at));
  }
  return out;
}

/** One row per account, joined to its profile through the profile's owner. */
export function userRows(snapshot: AdminSnapshot, accounts: Account[], now: number): UserRow[] {
  const profileByOwner = new Map<string, AdminSnapshot["profiles"][number]>();
  for (const p of snapshot.profiles) if (p.ownerId) profileByOwner.set(p.ownerId, p);
  const tally = tallies(snapshot, now);

  return accounts.map((a) => {
    const p = profileByOwner.get(a.id);
    const t = p ? tally.get(p.id) : undefined;
    return {
      id: a.id,
      email: a.email,
      isAdmin: a.isAdmin,
      providers: a.providers,
      confirmed: a.confirmed,
      createdAt: a.createdAt,
      lastSignInAt: a.lastSignInAt,
      lastActiveAt: toIso(latest(ms(a.lastSignInAt), t?.lastRunAt ?? 0, t?.lastEventAt ?? 0)),
      sources: p?.sources ?? 0,
      hasProfile: Boolean(p),
      interest: p?.interest ?? false,
      ntfy: p?.ntfy ?? false,
      editions: t?.editions ?? 0,
      runs: t?.runs ?? 0,
      runsWeek: t?.runsWeek ?? 0,
      failedMonth: t?.failedMonth ?? 0,
      lastRunAt: toIso(t?.lastRunAt ?? 0),
      lastRunStatus: t?.lastRunStatus ?? null,
      opens: t?.opens ?? 0,
      liked: t?.liked ?? 0,
      disliked: t?.disliked ?? 0,
    };
  });
}

function runLine(r: SnapRun, email: string | null): RunLine {
  const ended = r.status === "completed" || r.status === "failed";
  const took = ms(r.finishedAt) - ms(r.createdAt);
  return {
    id: r.id,
    at: r.createdAt,
    status: r.status,
    stage: r.stage,
    email,
    durationMs: ended && took >= 0 ? took : null,
    error: r.error,
  };
}

function reason(error: string | undefined): string {
  const text = (error ?? "").replace(/\s+/g, " ").trim();
  if (!text) return "No message recorded";
  return text.length > 140 ? `${text.slice(0, 139)}…` : text;
}

export function overview(snapshot: AdminSnapshot, accounts: Account[], now: number): Overview {
  const users = userRows(snapshot, accounts, now);
  const emailByProfile = new Map<string, string>();
  const ownerEmail = new Map(accounts.map((a) => [a.id, a.email]));
  for (const p of snapshot.profiles) {
    const email = p.ownerId ? ownerEmail.get(p.ownerId) : undefined;
    if (email) emailByProfile.set(p.id, email);
  }

  // Generations: counts, the last 30 days' outcome, and a bucket per UTC day for the chart.
  const today = dayStart(now);
  const days = Array.from({ length: CHART_DAYS }, (_, i) => today - (CHART_DAYS - 1 - i) * DAY);
  const daily: DayBucket[] = days.map((d) => ({ day: new Date(d).toISOString().slice(0, 10), completed: 0, failed: 0, other: 0 }));
  const bucketOf = new Map(days.map((d, i) => [d, i]));
  const reasons = new Map<string, { count: number; profiles: Set<string>; last: number }>();
  const durations: number[] = [];
  let day = 0;
  let week = 0;
  let completedMonth = 0;
  let failedMonth = 0;
  for (const r of snapshot.runs) {
    const at = ms(r.createdAt);
    if (at >= now - DAY) day++;
    if (at >= now - 7 * DAY) week++;
    const b = bucketOf.get(dayStart(at));
    if (b !== undefined) daily[b][r.status === "completed" ? "completed" : r.status === "failed" ? "failed" : "other"]++;
    if (at < now - 30 * DAY) continue;
    if (r.status === "completed") {
      completedMonth++;
      const took = ms(r.finishedAt) - at;
      if (took >= 0) durations.push(took);
    } else if (r.status === "failed") {
      failedMonth++;
      const key = reason(r.error);
      const g = reasons.get(key) ?? { count: 0, profiles: new Set<string>(), last: 0 };
      g.count++;
      g.profiles.add(r.profileId);
      g.last = latest(g.last, at);
      reasons.set(key, g);
    }
  }
  const finished = completedMonth + failedMonth;

  let opens = 0;
  let sourceClicks = 0;
  for (const i of snapshot.interactions) {
    if (ms(i.at) < now - 7 * DAY) continue;
    if (i.kind === "open") opens++;
    else sourceClicks++;
  }
  let liked = 0;
  let disliked = 0;
  for (const f of snapshot.feedback) {
    if (ms(f.at) < now - 7 * DAY) continue;
    if (f.signal === 1) liked++;
    else disliked++;
  }

  const recent = [...snapshot.runs]
    .sort((a, b) => ms(b.createdAt) - ms(a.createdAt))
    .slice(0, 8)
    .map((r) => runLine(r, emailByProfile.get(r.profileId) ?? null));

  return {
    users: {
      total: accounts.length,
      admins: accounts.filter((a) => a.isAdmin).length,
      newWeek: accounts.filter((a) => ms(a.createdAt) >= now - 7 * DAY).length,
      newMonth: accounts.filter((a) => ms(a.createdAt) >= now - 30 * DAY).length,
      activeWeek: users.filter((u) => ms(u.lastActiveAt) >= now - 7 * DAY).length,
      neverGenerated: users.filter((u) => u.runs === 0).length,
    },
    editions: { total: snapshot.editions.length, week: snapshot.editions.filter((e) => ms(e.createdAt) >= now - 7 * DAY).length },
    runs: {
      total: snapshot.runs.length,
      day,
      week,
      failedMonth,
      successRate: finished ? completedMonth / finished : null,
      medianMs: median(durations),
    },
    reading: { opens, sourceClicks, liked, disliked },
    funnel: {
      signedUp: users.length,
      addedSources: users.filter((u) => u.sources > 0).length,
      gotEdition: users.filter((u) => u.editions > 0).length,
      opened: users.filter((u) => u.opens > 0).length,
    },
    daily,
    failures: [...reasons.entries()]
      .map(([message, g]) => ({ message, count: g.count, users: g.profiles.size, last: new Date(g.last).toISOString() }))
      .sort((a, b) => b.count - a.count || b.last.localeCompare(a.last))
      .slice(0, 5),
    recent,
    truncated: snapshot.truncated,
  };
}

/** One account's usage: its generations and editions as times and statuses, with no content. */
export function userDetail(id: string, snapshot: AdminSnapshot, accounts: Account[], now: number, userWeeklyLimit: number): UserDetail | null {
  const account = accounts.find((a) => a.id === id);
  if (!account) return null;
  const user = userRows(snapshot, [account], now)[0];
  const profile = snapshot.profiles.find((p) => p.ownerId === account.id);
  const mine = profile ? snapshot.runs.filter((r) => r.profileId === profile.id) : [];
  return {
    user,
    runs: mine
      .sort((a, b) => ms(b.createdAt) - ms(a.createdAt))
      .slice(0, 20)
      .map((r) => runLine(r, account.email)),
    editions: (profile ? snapshot.editions.filter((e) => e.profileId === profile.id) : [])
      .sort((a, b) => ms(b.createdAt) - ms(a.createdAt))
      .slice(0, 20)
      .map((e) => ({ number: e.number, createdAt: e.createdAt, sample: e.sample })),
    quota: { used: user.runsWeek, limit: account.isAdmin ? null : userWeeklyLimit || null },
  };
}

export interface AdminData {
  now: number;
  snapshot: AdminSnapshot | null;
  accounts: Account[] | null;
  /** Why something is missing, in words for the admin. */
  problems: string[];
}

/** Loads both sources once per request; a failure in one still leaves the other usable. */
export const loadAdminData = cache(async (): Promise<AdminData> => {
  const now = Date.now();
  const since = new Date(now - EVENT_DAYS * DAY).toISOString();
  const [snapshot, accounts] = await Promise.allSettled([getStore().adminSnapshot(since), listAccounts()]);
  const problems: string[] = [];
  if (snapshot.status === "rejected") problems.push(`Statistics unavailable. ${messageOf(snapshot.reason)}`);
  if (accounts.status === "rejected") problems.push(`Account list unavailable. ${messageOf(accounts.reason)}`);
  return {
    now,
    snapshot: snapshot.status === "fulfilled" ? snapshot.value : null,
    accounts: accounts.status === "fulfilled" ? accounts.value : null,
    problems,
  };
});

const messageOf = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 300);
