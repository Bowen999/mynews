"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useSyncExternalStore } from "react";
import type { RunView } from "@/lib/run-view";
import { STAGES } from "@/lib/types";
import { startNavigationProgress } from "./NavigationProgress";
import { toast } from "./Toast";

/*
 * Keeps a briefing moving while the reader browses other pages of the site. Each POST /step runs one
 * pipeline stage on the server; the loop here issues them one after another and shares the latest
 * state with the progress page and the header. Closing or reloading the tab stops the loop; the run
 * then continues from its saved stage the next time its progress page is opened.
 */

export interface ActiveRun {
  run: RunView | null;
  /** Id of the run this tab is currently stepping, if any. */
  drivingId: string | null;
  netError: string | null;
}

const IDLE: ActiveRun = { run: null, drivingId: null, netError: null };
let snapshot: ActiveRun = IDLE;
const subscribers = new Set<() => void>();
const update = (patch: Partial<ActiveRun>) => {
  snapshot = { ...snapshot, ...patch };
  subscribers.forEach((s) => s());
};
const subscribe = (cb: () => void) => {
  subscribers.add(cb);
  return () => {
    subscribers.delete(cb);
  };
};

export function useActiveRun(): ActiveRun {
  return useSyncExternalStore(subscribe, () => snapshot, () => IDLE);
}

/** 1-based number of the stage being worked on (for a stopped run, the stage that stopped). */
export function stageStep(run: RunView): number {
  if (run.status === "completed") return STAGES.length;
  return Math.max(1, STAGES.findIndex((s) => s.key === run.stage) + 1);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let loop = 0; // bumping it stops the current loop

async function drive(runId: string) {
  const token = ++loop;
  const live = () => token === loop;
  update({ drivingId: runId, netError: null });
  let failures = 0;
  // A stage can take minutes; poll its live detail line meanwhile.
  const poll = window.setInterval(async () => {
    try {
      const res = await fetch(`/api/runs/${runId}`, { cache: "no-store" });
      if (!res.ok) return;
      const { run } = (await res.json()) as { run: RunView };
      const cur = snapshot.run;
      if (live() && cur?.id === runId && cur.status === "running" && run.updatedAt >= cur.updatedAt) update({ run });
    } catch {
      // transient; the next poll or step catches up
    }
  }, 2500);
  try {
    while (live()) {
      try {
        const res = await fetch(`/api/runs/${runId}/step`, { method: "POST" });
        const data = (await res.json().catch(() => ({}))) as { run?: RunView; busy?: boolean; error?: string };
        if (res.status === 401) {
          if (live()) update({ netError: "Your session ended. Sign in again to continue." });
          break;
        }
        if (!res.ok || !data.run) throw new Error(data.error ?? `HTTP ${res.status}`);
        failures = 0;
        if (!live()) break;
        update({ run: data.run, netError: null });
        if (data.run.status !== "running") break;
        if (data.busy) await sleep(4000); // another tab holds the lease for this stage
      } catch (e) {
        if (++failures >= 4) {
          if (live()) update({ netError: e instanceof Error ? e.message : "Connection lost" });
          break;
        }
        await sleep(3000 * failures);
      }
    }
  } finally {
    window.clearInterval(poll);
    if (live()) update({ drivingId: null });
  }
}

/**
 * Show this run (as just loaded from the server) and keep it moving while it is running. Opening a
 * different run's page pauses the one this tab was stepping.
 */
export function watchRun(view: RunView) {
  const cur = snapshot.run;
  if (cur?.id !== view.id) {
    loop++;
    update({ run: view, drivingId: null, netError: null });
  } else if (view.updatedAt >= cur.updatedAt) {
    update({ run: view });
  }
  const run = snapshot.run!;
  if (run.status === "running" && snapshot.drivingId !== run.id) void drive(run.id);
}

/** Resume a stopped run from its failed stage. Resolves to the new status; throws when the request fails. */
export async function retryRun(view: RunView): Promise<"running" | "needs_input"> {
  const res = await fetch(`/api/runs/${view.id}/retry`, { method: "POST" });
  const data = (await res.json().catch(() => ({}))) as { run?: RunView; requiredInputs?: RunView["requiredInputs"]; error?: string };
  if (res.ok && data.run) {
    watchRun(data.run);
    return "running";
  }
  if (data.requiredInputs) {
    if (snapshot.run?.id !== view.id) watchRun(view);
    update({ run: { ...view, status: "needs_input", requiredInputs: data.requiredInputs } });
    return "needs_input";
  }
  throw new Error(data.error ?? `Could not resume (HTTP ${res.status}).`);
}

/** Stop stepping and forget the run (on sign-out). */
export function forgetRun() {
  loop++;
  update(IDLE);
}

/**
 * Header status for a briefing that is generating while the reader is on another page, plus a
 * notification when it finishes, stops or needs input.
 */
export function RunIndicator() {
  const { run, drivingId } = useActiveRun();
  const pathname = usePathname();
  const router = useRouter();
  const seen = useRef<string | null>(null);
  const href = run ? `/runs/${run.id}` : "";
  const onRunPage = pathname === href;

  useEffect(() => {
    if (!run) return;
    const before = seen.current;
    seen.current = `${run.id}:${run.status}`;
    if (before !== `${run.id}:running` || run.status === "running" || onRunPage) return;
    const open = (to: string) => () => {
      startNavigationProgress();
      router.push(to);
    };
    if (run.status === "completed" && run.editionId) {
      toast.success("Your weekly briefing is ready.", { duration: 12000, action: { label: "Read it", onClick: open(`/editions/${run.editionId}`) } });
    } else if (run.status === "needs_input") {
      toast.error("Your briefing needs your input.", { action: { label: "Details", onClick: open(href) } });
    } else if (run.status === "failed") {
      toast.error(`Generation stopped${run.error ? `: ${run.error}` : "."}`, { action: { label: "Details", onClick: open(href) } });
    }
  }, [run, href, onRunPage, router]);

  // Closing the tab would pause the generation, so ask first.
  useEffect(() => {
    if (!drivingId) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [drivingId]);

  if (!run || run.status !== "running" || onRunPage) return null;
  const step = stageStep(run);
  const paused = drivingId !== run.id;
  return (
    <Link
      href={href}
      className="run-chip"
      title={paused ? "Generation paused: open it to continue" : "Generating your briefing"}
      aria-label={paused ? "Generation paused. Open it to continue." : `Generating your briefing: step ${step} of ${STAGES.length}`}
    >
      {paused ? <span className="run-chip-dot" aria-hidden /> : <span className="spinner" aria-hidden />}
      <span className="run-chip-text">{paused ? "Paused" : `Generating ${step}/${STAGES.length}`}</span>
    </Link>
  );
}
