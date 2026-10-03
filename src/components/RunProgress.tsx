"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { RunView } from "@/lib/run-view";
import { STAGES } from "@/lib/types";
import { formatRange } from "@/lib/util/dates";
import { startNavigationProgress } from "./NavigationProgress";
import { retryRun, stageStep, useActiveRun, watchRun } from "./RunDriver";
import { toast } from "./Toast";

const STATUS_LABEL = { pending: "Waiting", active: "Working", done: "Done", failed: "Stopped" } as const;

function clock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * Live progress of one generation. The steps themselves are driven by RunDriver, which keeps going
 * when the reader moves to another page, so this view only shows the shared state.
 */
export function RunProgress({ initial }: { initial: RunView }) {
  const router = useRouter();
  const shared = useActiveRun();
  const mine = shared.run?.id === initial.id;
  const run = mine && shared.run ? shared.run : initial;
  const netError = mine ? shared.netError : null;
  const [retrying, setRetrying] = useState(false);
  const [now, setNow] = useState<number | null>(null);
  const sawRunning = useRef(false);

  useEffect(() => {
    watchRun(initial);
  }, [initial]);

  // A clock for the elapsed time while the run is working.
  useEffect(() => {
    if (run.status !== "running") return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [run.status]);

  // When a run we watched finishes, open the new edition.
  useEffect(() => {
    if (run.status === "running") {
      sawRunning.current = true;
      return;
    }
    if (run.status !== "completed" || !run.editionId || !sawRunning.current) return;
    const t = window.setTimeout(() => {
      startNavigationProgress();
      router.push(`/editions/${run.editionId}`);
    }, 1400);
    return () => window.clearTimeout(t);
  }, [run.status, run.editionId, router]);

  const step = stageStep(run);
  const done = run.progress.filter((p) => p.status === "done").length;
  const current = STAGES[step - 1];

  // The tab title shows progress, so it can be followed from another tab.
  useEffect(() => {
    document.title =
      run.status === "running"
        ? `(${step}/${STAGES.length}) Generating · MyNews`
        : run.status === "completed"
          ? "Briefing ready · MyNews"
          : run.status === "failed"
            ? "Generation stopped · MyNews"
            : "Input needed · MyNews";
  }, [run.status, step]);

  const retry = async () => {
    setRetrying(true);
    try {
      if ((await retryRun(run)) === "needs_input") toast.error("Still waiting for your input. See what’s needed below.");
    } catch (e) {
      toast.error(e instanceof TypeError ? "Could not reach the server. Check your connection and try again." : (e as Error).message);
    } finally {
      setRetrying(false);
    }
  };

  const title =
    run.status === "completed"
      ? "Your briefing is ready"
      : run.status === "failed"
        ? "Generation stopped"
        : run.status === "needs_input"
          ? "Waiting for your input"
          : "Composing your briefing";

  const fraction = run.status === "completed" ? 1 : (done + (run.status === "running" ? 0.5 : 0)) / STAGES.length;
  const elapsed = now !== null && run.status === "running" ? now - Date.parse(run.createdAt) : null;

  return (
    <div className="wrap">
      <header className="page-head">
        <div className="label">Weekly Briefing · {formatRange(run.windowStart, run.windowEnd)}</div>
        <h1 className="title-xl">{title}</h1>
        <p className="dek">
          {run.status === "running"
            ? "Searching the past seven days, verifying sources and writing your top ten. This usually takes two to five minutes. You can keep reading other pages meanwhile; closing this tab pauses it until you come back."
            : run.status === "completed"
              ? "Opening your new edition…"
              : run.status === "needs_input"
                ? "Something needs your attention before the briefing can continue."
                : "The run is saved. You can resume from the step that stopped."}
        </p>
      </header>

      <div
        className={`run-meter ${run.status}`}
        role="progressbar"
        aria-label="Briefing progress"
        aria-valuemin={0}
        aria-valuemax={STAGES.length}
        aria-valuenow={run.status === "completed" ? STAGES.length : done}
        aria-valuetext={run.status === "completed" ? "Finished" : `Step ${step} of ${STAGES.length}: ${current.label}`}
      >
        <span style={{ transform: `scaleX(${fraction})` }} />
      </div>
      <p className="run-status" aria-live="polite">
        {run.status === "completed" ? (
          <>All {STAGES.length} steps done</>
        ) : (
          <>
            <b>
              Step {step} of {STAGES.length}
            </b>{" "}
            · {current.label}
            {elapsed !== null && elapsed < 2 * 3600e3 && <span className="muted"> · {clock(elapsed)} elapsed</span>}
          </>
        )}
      </p>

      <div className="stages-wrap">
        <ol className="stages">
          {STAGES.map((s, i) => {
            const p = run.progress.find((x) => x.key === s.key);
            const status = p?.status ?? "pending";
            return (
              <li key={s.key} className={`stage ${status}`}>
                <span className="sn">{String(i + 1).padStart(2, "0")}</span>
                <span className="sl">{s.label}</span>
                <span className="sd">{p?.detail ?? ""}</span>
                <span className="ss">{STATUS_LABEL[status]}</span>
              </li>
            );
          })}
        </ol>
      </div>

      <div className="notices">
        {run.status === "completed" && run.editionId && (
          <div className="notice">
            <strong>Edition ready.</strong> Your top stories for the week have been written and verified.
            <div style={{ marginTop: 14 }}>
              <Link className="btn btn-solid" href={`/editions/${run.editionId}`}>
                Read the edition <span className="arrow">→</span>
              </Link>
            </div>
          </div>
        )}
        {run.status === "failed" && (
          <div className="notice error" role="alert">
            <strong>{run.error}</strong>
            <div style={{ marginTop: 14 }}>
              <button type="button" className="btn btn-solid btn-sm" onClick={retry} disabled={retrying} aria-busy={retrying}>
                {retrying && <span className="spinner" />} Resume from this step
              </button>
            </div>
          </div>
        )}
        {run.status === "needs_input" && (
          <div className="notice warn" role="alert">
            {run.requiredInputs?.map((i) => (
              <p key={i.key} style={{ margin: "0 0 8px" }}>
                <strong>{i.message}</strong> {i.action}
              </p>
            ))}
            <div className="row" style={{ marginTop: 14 }}>
              <Link className="btn btn-sm" href="/profile">
                Open profile
              </Link>
              <button type="button" className="btn btn-solid btn-sm" onClick={retry} disabled={retrying} aria-busy={retrying}>
                {retrying && <span className="spinner" />} Try again
              </button>
            </div>
          </div>
        )}
        {netError && run.status === "running" && (
          <div className="notice error" role="alert">
            <strong>Lost connection to the generator ({netError}).</strong> The run is saved and continues from where it stopped.
            <div style={{ marginTop: 14 }}>
              <button type="button" className="btn btn-solid btn-sm" onClick={() => watchRun(run)}>
                Reconnect
              </button>
            </div>
          </div>
        )}
      </div>

      <details className="log">
        <summary>Activity log</summary>
        <ol>
          {run.log.map((l, i) => (
            <li key={i} className={l.level}>
              {new Date(l.at).toLocaleTimeString()} — {l.message}
            </li>
          ))}
        </ol>
      </details>
    </div>
  );
}
