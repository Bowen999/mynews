import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Edition, EditionSummary, Feedback, Profile, Run, RunSummary, SourceSnapshot } from "../types";
import { summarizeEdition, type Store } from "./types";

type Row = Record<string, unknown>;

/** Turn raw Supabase/PostgREST errors into short, actionable messages. */
export function describeSupabaseError(what: string, error: { message?: string; code?: string }): string {
  const msg = String(error.message ?? "");
  if (/<!doctype html|<html/i.test(msg)) {
    return `Supabase ${what}: got a web page instead of API data, so SUPABASE_URL is wrong. Use the Project URL (https://<project-ref>.supabase.co) from Project Settings → API, not the dashboard link.`;
  }
  if (error.code === "42P01" || error.code === "PGRST205" || /does not exist|could not find the table/i.test(msg)) {
    return `Supabase ${what}: tables are missing. Run supabase/migrations/0001_init.sql in the Supabase SQL editor.`;
  }
  if (error.code === "42501" || /permission denied|row-level security/i.test(msg)) {
    return `Supabase ${what}: permission denied. SUPABASE_SERVICE_ROLE_KEY must be the service_role / secret key, not the anon or publishable key.`;
  }
  if (/invalid api key|jwt|apikey/i.test(msg)) {
    return `Supabase ${what}: the API key was rejected. Check SUPABASE_SERVICE_ROLE_KEY (service_role / secret key).`;
  }
  return `Supabase ${what}: ${msg.length > 300 ? `${msg.slice(0, 300)}…` : msg}`;
}

function check<T>(res: { data: T; error: { message: string; code?: string } | null }, what: string): T {
  if (res.error) throw new Error(describeSupabaseError(what, res.error));
  return res.data;
}

const profileToRow = (p: Profile): Row => ({
  id: p.id,
  owner_id: p.ownerId ?? null,
  name: p.name,
  sources: p.sources,
  interest: p.interest,
  preferences: p.preferences,
  created_at: p.createdAt,
  updated_at: p.updatedAt,
});

const rowToProfile = (r: Row): Profile => ({
  id: r.id as string,
  ownerId: (r.owner_id as string | null) ?? null,
  name: r.name as string,
  sources: (r.sources as Profile["sources"]) ?? [],
  interest: (r.interest as Profile["interest"]) ?? null,
  preferences: r.preferences as Profile["preferences"],
  createdAt: r.created_at as string,
  updatedAt: r.updated_at as string,
});

const runToRow = (r: Run): Row => ({
  id: r.id,
  profile_id: r.profileId,
  status: r.status,
  stage: r.stage,
  progress: r.progress,
  log: r.log,
  state: r.state,
  window_start: r.windowStart,
  window_end: r.windowEnd,
  base_url: r.baseUrl ?? null,
  notify: r.notify ?? null,
  error: r.error ?? null,
  edition_id: r.editionId ?? null,
  required_inputs: r.requiredInputs ?? null,
  created_at: r.createdAt,
  updated_at: r.updatedAt,
  finished_at: r.finishedAt ?? null,
});

const rowToRun = (r: Row): Run => ({
  id: r.id as string,
  profileId: r.profile_id as string,
  status: r.status as Run["status"],
  stage: r.stage as Run["stage"],
  progress: (r.progress as Run["progress"]) ?? [],
  log: (r.log as Run["log"]) ?? [],
  state: (r.state as Run["state"]) ?? {},
  windowStart: r.window_start as string,
  windowEnd: r.window_end as string,
  baseUrl: (r.base_url as string) ?? undefined,
  notify: (r.notify as Run["notify"]) ?? undefined,
  error: (r.error as string) ?? undefined,
  editionId: (r.edition_id as string) ?? undefined,
  requiredInputs: (r.required_inputs as Run["requiredInputs"]) ?? undefined,
  leaseUntil: (r.lease_until as string) ?? null,
  createdAt: r.created_at as string,
  updatedAt: r.updated_at as string,
  finishedAt: (r.finished_at as string) ?? undefined,
});

const editionToRow = (e: Edition, html: string): Row => ({
  id: e.id,
  profile_id: e.profileId,
  run_id: e.runId,
  number: e.number,
  headline: e.headline,
  dek: e.dek,
  themes: e.themes,
  window_start: e.windowStart,
  window_end: e.windowEnd,
  items: e.items,
  also_noted: e.alsoNoted,
  stats: e.stats,
  profile_summary: e.profileSummary,
  model: e.model,
  sample: e.sample ?? false,
  standalone_html: html,
  created_at: e.createdAt,
});

const rowToEdition = (r: Row): Edition => ({
  id: r.id as string,
  profileId: r.profile_id as string,
  runId: r.run_id as string,
  number: r.number as number,
  headline: r.headline as string,
  dek: r.dek as string,
  themes: (r.themes as string[]) ?? [],
  windowStart: r.window_start as string,
  windowEnd: r.window_end as string,
  createdAt: r.created_at as string,
  items: (r.items as Edition["items"]) ?? [],
  alsoNoted: (r.also_noted as Edition["alsoNoted"]) ?? [],
  stats: r.stats as Edition["stats"],
  profileSummary: (r.profile_summary as string) ?? "",
  model: r.model as Edition["model"],
  sample: Boolean(r.sample),
});

const rowToFeedback = (r: Row): Feedback => ({
  id: r.id as string,
  profileId: r.profile_id as string,
  editionId: r.edition_id as string,
  itemId: r.item_id as string,
  itemTitle: r.item_title as string,
  category: r.category as Feedback["category"],
  signal: r.signal as 1 | -1,
  createdAt: r.created_at as string,
});

const EDITION_COLUMNS =
  "id,profile_id,run_id,number,headline,dek,themes,window_start,window_end,items,also_noted,stats,profile_summary,model,sample,created_at";

/** Supabase (Postgres) store. Uses the service-role key server-side only; tables have RLS enabled with no public policies. */
export class SupabaseStore implements Store {
  readonly kind = "supabase" as const;
  private readonly db: SupabaseClient;

  constructor(url: string, key: string) {
    this.db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  }

  async getProfile(id: string) {
    const data = check(await this.db.from("profiles").select("*").eq("id", id).maybeSingle(), "getProfile");
    return data ? rowToProfile(data) : null;
  }
  async getProfileByOwner(ownerId: string) {
    const data = check(await this.db.from("profiles").select("*").eq("owner_id", ownerId).limit(1).maybeSingle(), "getProfileByOwner");
    return data ? rowToProfile(data) : null;
  }
  async saveProfile(profile: Profile) {
    check(await this.db.from("profiles").upsert(profileToRow(profile)), "saveProfile");
  }

  async getSnapshot(url: string) {
    const data = check(await this.db.from("source_snapshots").select("data").eq("url", url).maybeSingle(), "getSnapshot");
    return data ? (data.data as SourceSnapshot) : null;
  }
  async saveSnapshot(s: SourceSnapshot) {
    check(await this.db.from("source_snapshots").upsert({ url: s.url, data: s, fetched_at: s.fetchedAt }), "saveSnapshot");
  }

  async createRun(run: Run) {
    check(await this.db.from("runs").insert(runToRow(run)), "createRun");
  }
  async getRun(id: string) {
    const data = check(await this.db.from("runs").select("*").eq("id", id).maybeSingle(), "getRun");
    return data ? rowToRun(data) : null;
  }
  async saveRun(run: Run) {
    check(await this.db.from("runs").update(runToRow(run)).eq("id", run.id), "saveRun");
  }
  async tryLease(runId: string, ms: number) {
    const now = new Date();
    const until = new Date(now.getTime() + ms).toISOString();
    const data = check(
      await this.db
        .from("runs")
        .update({ lease_until: until })
        .eq("id", runId)
        .or(`lease_until.is.null,lease_until.lt."${now.toISOString()}"`)
        .select("id"),
      "tryLease",
    );
    return Array.isArray(data) && data.length > 0;
  }
  async releaseLease(runId: string) {
    check(await this.db.from("runs").update({ lease_until: null }).eq("id", runId), "releaseLease");
  }
  async listRuns(profileId: string, limit: number): Promise<RunSummary[]> {
    const data = check(
      await this.db
        .from("runs")
        .select("id,status,stage,created_at,updated_at,window_start,window_end,edition_id,error")
        .eq("profile_id", profileId)
        .order("created_at", { ascending: false })
        .limit(limit),
      "listRuns",
    );
    return (data ?? []).map((r: Row) => ({
      id: r.id as string,
      status: r.status as Run["status"],
      stage: r.stage as Run["stage"],
      createdAt: r.created_at as string,
      updatedAt: r.updated_at as string,
      windowStart: r.window_start as string,
      windowEnd: r.window_end as string,
      editionId: (r.edition_id as string) ?? undefined,
      error: (r.error as string) ?? undefined,
    }));
  }

  async countRunsSince(sinceIso: string, profileId?: string) {
    let q = this.db.from("runs").select("id", { count: "exact", head: true }).gte("created_at", sinceIso);
    if (profileId) q = q.eq("profile_id", profileId);
    const res = await q;
    if (res.error) throw new Error(describeSupabaseError("countRunsSince", res.error));
    return res.count ?? 0;
  }

  async nextEditionNumber(profileId: string) {
    const data = check(
      await this.db.from("editions").select("number").eq("profile_id", profileId).order("number", { ascending: false }).limit(1),
      "nextEditionNumber",
    );
    return ((data?.[0]?.number as number | undefined) ?? 0) + 1;
  }
  async saveEdition(edition: Edition, html: string) {
    check(await this.db.from("editions").upsert(editionToRow(edition, html)), "saveEdition");
  }
  async getEdition(id: string) {
    const data = check(await this.db.from("editions").select(EDITION_COLUMNS).eq("id", id).maybeSingle(), "getEdition");
    return data ? rowToEdition(data as Row) : null;
  }
  async recentEditions(profileId: string, limit: number) {
    const data = check(
      await this.db
        .from("editions")
        .select(EDITION_COLUMNS)
        .eq("profile_id", profileId)
        .order("created_at", { ascending: false })
        .limit(limit),
      "recentEditions",
    );
    return (data ?? []).map((r) => rowToEdition(r as Row));
  }
  async getLatestEdition(profileId: string) {
    return (await this.recentEditions(profileId, 1))[0] ?? null;
  }
  async listEditions(profileId: string, limit: number): Promise<EditionSummary[]> {
    return (await this.recentEditions(profileId, limit)).map(summarizeEdition);
  }
  async getStandaloneHtml(id: string) {
    const data = check(await this.db.from("editions").select("standalone_html").eq("id", id).maybeSingle(), "getStandaloneHtml");
    return (data?.standalone_html as string | undefined) ?? null;
  }
  async deleteEdition(id: string) {
    check(await this.db.from("editions").delete().eq("id", id), "deleteEdition");
  }

  async setFeedback(f: Feedback) {
    check(
      await this.db.from("feedback").upsert(
        {
          id: f.id,
          profile_id: f.profileId,
          edition_id: f.editionId,
          item_id: f.itemId,
          item_title: f.itemTitle,
          category: f.category,
          signal: f.signal,
          created_at: f.createdAt,
        },
        { onConflict: "edition_id,item_id" },
      ),
      "setFeedback",
    );
  }
  async clearFeedback(editionId: string, itemId: string) {
    check(await this.db.from("feedback").delete().eq("edition_id", editionId).eq("item_id", itemId), "clearFeedback");
  }
  async listFeedback(profileId: string, limit: number) {
    const data = check(
      await this.db.from("feedback").select("*").eq("profile_id", profileId).order("created_at", { ascending: false }).limit(limit),
      "listFeedback",
    );
    return (data ?? []).map(rowToFeedback);
  }
  async feedbackForEdition(editionId: string) {
    const data = check(await this.db.from("feedback").select("*").eq("edition_id", editionId), "feedbackForEdition");
    return (data ?? []).map(rowToFeedback);
  }
}
