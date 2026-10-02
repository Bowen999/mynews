import { configurationProblems } from "../config";
import { getLLM } from "../llm";
import type { LLMProvider } from "../llm/types";
import { notify } from "../notify";
import { getStore, loadProfile } from "../store";
import { STAGES, type Profile, type RequiredInput, type Run, type StageKey } from "../types";
import { Deadline } from "../util/concurrency";
import { formatRange, previousWeekWindow } from "../util/dates";
import { newId } from "../util/text";
import { clusterStage } from "./cluster";
import { collectStage, searchStage } from "./collect";
import { NeedsInputError, type StageContext, type StageResult } from "./context";
import { profileStage } from "./profile";
import { publishStage } from "./publish";
import { rankStage } from "./rank";
import { sourcesStage } from "./sources";
import { synthesizeStage } from "./synthesize";

/** Must stay below the route's maxDuration so a stage can wrap up and persist. */
export const STEP_BUDGET_MS = 240_000;
/** Longer than maxDuration so a killed invocation can never overlap with the next one. */
const LEASE_MS = 310_000;
const STALE_RUN_MS = 20 * 60_000;

const HANDLERS: Record<StageKey, (ctx: StageContext) => Promise<StageResult>> = {
  sources: sourcesStage,
  profile: profileStage,
  search: searchStage,
  collect: collectStage,
  cluster: clusterStage,
  rank: rankStage,
  synthesize: synthesizeStage,
  publish: publishStage,
};

function link(run: Run, path: string): string | undefined {
  return run.baseUrl ? `${run.baseUrl.replace(/\/+$/, "")}${path}` : undefined;
}

export function databaseProblem(e: unknown): RequiredInput {
  return {
    key: "DATABASE",
    message: `Could not read from the database (${(e instanceof Error ? e.message : String(e)).slice(0, 400)}).`,
    action: "Run supabase/migrations/0001_init.sql in the Supabase SQL editor and check SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.",
  };
}

export type StartResult = { ok: true; run: Run; resumed: boolean } | { ok: false; problems: RequiredInput[] };

/** Validate configuration, then create a run (or return one already in progress). */
export async function startRun(opts: { baseUrl?: string }): Promise<StartResult> {
  const store = getStore();
  const problems = configurationProblems();
  let profile: Profile | null = null;
  if (!problems.some((p) => p.key === "SUPABASE")) {
    try {
      profile = await loadProfile(store);
    } catch (e) {
      problems.push(databaseProblem(e));
    }
  }
  if (profile && !profile.sources.length) {
    problems.push({
      key: "SOURCES",
      message: "No reference sources configured.",
      action: "Add at least one URL (homepage, Google Scholar, lab or company page) on the Profile page.",
    });
  }
  if (problems.length) {
    await notify("input_required", problems.map((p) => `${p.message} ${p.action ?? ""}`.trim()).join("\n"), {
      click: opts.baseUrl ? `${opts.baseUrl}/profile` : undefined,
    });
    return { ok: false, problems };
  }

  const active = (await store.listRuns(profile!.id, 5)).find(
    (r) => r.status === "running" && Date.now() - new Date(r.updatedAt).getTime() < STALE_RUN_MS,
  );
  if (active) {
    const run = await store.getRun(active.id);
    if (run) return { ok: true, run, resumed: true };
  }

  const w = previousWeekWindow();
  const now = new Date().toISOString();
  const run: Run = {
    id: newId("run"),
    profileId: profile!.id,
    status: "running",
    stage: STAGES[0].key,
    progress: STAGES.map((s) => ({ key: s.key, status: "pending" })),
    log: [{ at: now, level: "info", message: `Generation started for ${formatRange(w.start.toISOString(), w.end.toISOString())}.` }],
    state: {},
    windowStart: w.start.toISOString(),
    windowEnd: w.end.toISOString(),
    baseUrl: opts.baseUrl,
    createdAt: now,
    updatedAt: now,
  };
  await store.createRun(run);
  await notify("started", `Generating the edition for ${formatRange(run.windowStart, run.windowEnd)} from ${profile!.sources.length} reference source(s).`, {
    click: link(run, `/runs/${run.id}`),
  });
  return { ok: true, run, resumed: false };
}

export type AdvanceResult = { run: Run; busy?: boolean };

/** Execute the current stage of a run (one stage, or one chunk of a long stage, per call). */
export async function advanceRun(runId: string): Promise<AdvanceResult> {
  const store = getStore();
  const run = await store.getRun(runId);
  if (!run) throw new Error("Run not found");
  if (run.status !== "running") return { run };
  if (!(await store.tryLease(runId, LEASE_MS))) return { run, busy: true };

  const profile = await loadProfile(store);
  const deadline = new Deadline(STEP_BUDGET_MS);
  const stageIndex = STAGES.findIndex((s) => s.key === run.stage);
  const progress = run.progress[stageIndex];
  let llm: LLMProvider | undefined;
  let lastSave = 0;

  const save = async () => {
    run.updatedAt = new Date().toISOString();
    await store.saveRun(run);
    lastSave = Date.now();
  };

  const ctx: StageContext = {
    run,
    store,
    profile,
    window: { start: new Date(run.windowStart), end: new Date(run.windowEnd) },
    deadline,
    llm: () => (llm ??= getLLM()),
    log: (level, message) => {
      run.log.push({ at: new Date().toISOString(), level, message });
      if (run.log.length > 200) run.log.splice(0, run.log.length - 200);
    },
    detail: async (text) => {
      progress.detail = text;
      if (Date.now() - lastSave > 2000) {
        try {
          await save();
        } catch {
          // progress persistence is best-effort
        }
      }
    },
  };

  try {
    if (progress.status !== "active") {
      progress.status = "active";
      progress.startedAt = new Date().toISOString();
      await save();
    }
    const result = await HANDLERS[run.stage](ctx);
    if (result.done) {
      progress.status = "done";
      progress.finishedAt = new Date().toISOString();
      const next = STAGES[stageIndex + 1];
      if (next) {
        run.stage = next.key;
      } else {
        run.status = "completed";
        run.finishedAt = new Date().toISOString();
        // Intermediate state is large and no longer needed once the edition exists.
        run.state = { interest: run.state.interest, queriesRun: run.state.queriesRun, providers: run.state.providers };
      }
    }
    await save();
    if (run.status === "completed" && run.editionId) {
      const edition = await store.getEdition(run.editionId);
      await notify(
        "completed",
        `Edition No. ${edition?.number ?? "?"} is ready: ${edition?.headline ?? ""} (${edition?.items.length ?? 0} stories, ${formatRange(run.windowStart, run.windowEnd)}).`,
        { click: link(run, `/editions/${run.editionId}`) },
      );
    }
  } catch (e) {
    if (e instanceof NeedsInputError) {
      run.status = "needs_input";
      run.requiredInputs = e.inputs;
      progress.status = "failed";
      ctx.log("warn", e.message);
      await save();
      await notify("input_required", e.inputs.map((i) => `${i.message} ${i.action ?? ""}`.trim()).join("\n"), {
        click: link(run, "/profile"),
      });
    } else {
      const message = e instanceof Error ? e.message : String(e);
      run.status = "failed";
      run.error = message;
      progress.status = "failed";
      progress.finishedAt = new Date().toISOString();
      ctx.log("error", `${STAGES[stageIndex].label} failed: ${message}`);
      await save();
      await notify("failed", `Stage "${STAGES[stageIndex].label}" failed: ${message.slice(0, 300)}`, { click: link(run, `/runs/${run.id}`) });
    }
  } finally {
    await store.releaseLease(runId).catch(() => undefined);
  }
  return { run };
}

/** Resume a failed or input-blocked run from the stage where it stopped. */
export async function retryRun(runId: string): Promise<Run> {
  const store = getStore();
  const run = await store.getRun(runId);
  if (!run) throw new Error("Run not found");
  if (run.status === "failed" || run.status === "needs_input") {
    const problems = configurationProblems();
    if (problems.length) throw new NeedsInputError(problems);
    run.status = "running";
    run.error = undefined;
    run.requiredInputs = undefined;
    const idx = STAGES.findIndex((s) => s.key === run.stage);
    run.progress[idx] = { ...run.progress[idx], status: "pending", detail: undefined };
    run.log.push({ at: new Date().toISOString(), level: "info", message: `Resumed from "${STAGES[idx].label}".` });
    run.updatedAt = new Date().toISOString();
    await store.saveRun(run);
  }
  return run;
}
