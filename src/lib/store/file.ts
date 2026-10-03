import { promises as fs } from "node:fs";
import path from "node:path";
import type { Edition, EditionSummary, Feedback, Interaction, Profile, Run, RunSummary, SourceSnapshot } from "../types";
import { shortHash } from "../util/text";
import { summarizeEdition, summarizeRun, type Store } from "./types";

const leases: Map<string, number> = ((globalThis as Record<string, unknown>).__mynewsLeases ??= new Map()) as Map<string, number>;

/** Filesystem store for local development. Not suitable for serverless deployments. */
export class FileStore implements Store {
  readonly kind = "file" as const;
  constructor(private readonly root: string) {}

  private p(...parts: string[]) {
    return path.join(this.root, ...parts);
  }

  private async read<T>(file: string): Promise<T | null> {
    try {
      return JSON.parse(await fs.readFile(file, "utf8")) as T;
    } catch {
      return null;
    }
  }

  private async write(file: string, data: unknown): Promise<void> {
    await fs.mkdir(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
    await fs.writeFile(tmp, typeof data === "string" ? data : JSON.stringify(data, null, 1));
    await fs.rename(tmp, file);
  }

  private async list<T>(dir: string): Promise<T[]> {
    let names: string[] = [];
    try {
      names = await fs.readdir(this.p(dir));
    } catch {
      return [];
    }
    const out: T[] = [];
    for (const n of names.filter((n) => n.endsWith(".json"))) {
      const v = await this.read<T>(this.p(dir, n));
      if (v) out.push(v);
    }
    return out;
  }

  getProfile(id: string) {
    return this.read<Profile>(this.p("profiles", `${id}.json`));
  }
  async getProfileByOwner(ownerId: string) {
    return (await this.list<Profile>("profiles")).find((p) => p.ownerId === ownerId) ?? null;
  }
  saveProfile(profile: Profile) {
    return this.write(this.p("profiles", `${profile.id}.json`), profile);
  }

  getSnapshot(url: string) {
    return this.read<SourceSnapshot>(this.p("snapshots", `${shortHash(url, 16)}.json`));
  }
  saveSnapshot(s: SourceSnapshot) {
    return this.write(this.p("snapshots", `${shortHash(s.url, 16)}.json`), s);
  }

  createRun(run: Run) {
    return this.write(this.p("runs", `${run.id}.json`), run);
  }
  getRun(id: string) {
    return this.read<Run>(this.p("runs", `${id}.json`));
  }
  saveRun(run: Run) {
    return this.write(this.p("runs", `${run.id}.json`), { ...run, leaseUntil: null });
  }
  async tryLease(runId: string, ms: number) {
    const now = Date.now();
    const current = leases.get(runId);
    if (current && current > now) return false;
    leases.set(runId, now + ms);
    return true;
  }
  async releaseLease(runId: string) {
    leases.delete(runId);
  }
  async listRuns(profileId: string, limit: number): Promise<RunSummary[]> {
    const runs = (await this.list<Run>("runs")).filter((r) => r.profileId === profileId);
    return runs
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit)
      .map(summarizeRun);
  }

  async countRunsSince(sinceIso: string, profileId?: string) {
    return (await this.list<Run>("runs")).filter((r) => r.createdAt >= sinceIso && (!profileId || r.profileId === profileId)).length;
  }

  async nextEditionNumber(profileId: string) {
    const eds = (await this.list<Edition>("editions")).filter((e) => e.profileId === profileId);
    return eds.reduce((m, e) => Math.max(m, e.number), 0) + 1;
  }
  async saveEdition(edition: Edition, html: string) {
    await this.write(this.p("editions", `${edition.id}.json`), edition);
    await this.write(this.p("editions-html", `${edition.id}.html`), html);
  }
  getEdition(id: string) {
    return this.read<Edition>(this.p("editions", `${id}.json`));
  }
  async recentEditions(profileId: string, limit: number) {
    const eds = (await this.list<Edition>("editions")).filter((e) => e.profileId === profileId);
    return eds.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit);
  }
  async getLatestEdition(profileId: string) {
    return (await this.recentEditions(profileId, 1))[0] ?? null;
  }
  async listEditions(profileId: string, limit: number): Promise<EditionSummary[]> {
    return (await this.recentEditions(profileId, limit)).map(summarizeEdition);
  }
  async getStandaloneHtml(id: string) {
    try {
      return await fs.readFile(this.p("editions-html", `${id}.html`), "utf8");
    } catch {
      return null;
    }
  }
  /** Also drops the ratings and reading history of its stories, as `on delete cascade` does in Supabase. */
  async deleteEdition(id: string) {
    await fs.rm(this.p("editions", `${id}.json`), { force: true });
    await fs.rm(this.p("editions-html", `${id}.html`), { force: true });
    const feedback = await this.allFeedback();
    if (feedback.some((f) => f.editionId === id)) await this.write(this.p("feedback.json"), feedback.filter((f) => f.editionId !== id));
    const interactions = await this.allInteractions();
    if (interactions.some((i) => i.editionId === id)) await this.write(this.p("interactions.json"), interactions.filter((i) => i.editionId !== id));
  }

  private async allFeedback(): Promise<Feedback[]> {
    return (await this.read<Feedback[]>(this.p("feedback.json"))) ?? [];
  }
  async setFeedback(f: Feedback) {
    const all = (await this.allFeedback()).filter((x) => !(x.editionId === f.editionId && x.itemId === f.itemId));
    all.push(f);
    await this.write(this.p("feedback.json"), all);
  }
  async clearFeedback(editionId: string, itemId: string) {
    const all = (await this.allFeedback()).filter((x) => !(x.editionId === editionId && x.itemId === itemId));
    await this.write(this.p("feedback.json"), all);
  }
  async listFeedback(profileId: string, limit: number) {
    return (await this.allFeedback())
      .filter((f) => f.profileId === profileId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit);
  }
  async feedbackForEdition(editionId: string) {
    return (await this.allFeedback()).filter((f) => f.editionId === editionId);
  }

  private async allInteractions(): Promise<Interaction[]> {
    return (await this.read<Interaction[]>(this.p("interactions.json"))) ?? [];
  }
  async addInteraction(i: Interaction) {
    const all = await this.allInteractions();
    if (all.some((x) => x.id === i.id)) return;
    all.push(i);
    await this.write(this.p("interactions.json"), all.slice(-5000));
  }
  async listInteractions(profileId: string, limit: number) {
    return (await this.allInteractions())
      .filter((i) => i.profileId === profileId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit);
  }
}
