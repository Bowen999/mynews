"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { RunView } from "@/lib/run-view";
import { STAGES } from "@/lib/types";
import { formatRange } from "@/lib/util/dates";
import { CheckIcon, CloseIcon } from "./Icons";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Drives a run from the browser: each POST /step executes one pipeline stage within the
 * serverless time limit, while a lightweight poll shows live detail from the running stage.
 */
export function RunProgress({ initial }: { initial: RunView }) {
  const router = useRouter();
  const [run, setRun] = useState<RunView>(initial);
  const [netError, setNetError] = useState<string | null>(null);
  const driving = useRef(false);
  const mounted = useRef(true);

  const drive = useCallback(async () => {
    if (driving.current) return;
    driving.current = true;
    setNetError(null);
    let failures = 0;
    let current: RunView | null = null;
    const poll = window.setInterval(async () => {
      try {
        const res = await fetch(`/api/runs/${initial.id}`, { cache: "no-store" });
        if (res.ok && mounted.current) {
          const data = (await res.json()) as { run: RunView };
          setRun((prev) => (prev.status === "running" ? data.run : prev));
        }
      } catch {
        // ignore transient poll errors
      }
    }, 2500);
    try {
      while (mounted.current) {
        try {
          const res = await fetch(`/api/runs/${initial.id}/step`, { method: "POST" });
          const data = (await res.json()) as { run?: RunView; busy?: boolean; error?: string };
          if (!res.ok || !data.run) throw new Error(data.error ?? `HTTP ${res.status}`);
          failures = 0;
          current = data.run;
          if (mounted.current) setRun(data.run);
          if (data.run.status !== "running") break;
          if (data.busy) await sleep(4000);
        } catch (e) {
          failures++;
          if (failures >= 4) {
            setNetError(e instanceof Error ? e.message : "Connection lost");
            break;
          }
          await sleep(3000 * failures);
        }
      }
    } finally {
      window.clearInterval(poll);
      driving.current = false;
    }
    const finished = current as RunView | null;
    if (finished?.status === "completed" && finished.editionId && mounted.current) {
      await sleep(1400);
      if (mounted.current) router.push(`/editions/${finished.editionId}`);
    }
  }, [initial.id, router]);

  useEffect(() => {
    mounted.current = true;
    if (initial.status === "running") void drive();
    return () => {
      mounted.current = false;
    };
  }, [drive, initial.status]);

  const retry = async () => {
    const res = await fetch(`/api/runs/${run.id}/retry`, { method: "POST" });
    const data = await res.json();
    if (res.ok) {
      setRun(data.run);
      void drive();
    } else if (data.requiredInputs) {
      setRun({ ...run, status: "needs_input", requiredInputs: data.requiredInputs });
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

  return (
    <div className="container narrow progress-page">
      <div className="kicker">Weekly Briefing · {formatRange(run.windowStart, run.windowEnd)}</div>
      <h1>{title}</h1>
      <p className="sub">
        {run.status === "running"
          ? "Searching the past seven days, verifying sources and writing your top ten. This usually takes two to five minutes; keep this tab open."
          : run.status === "completed"
            ? "Opening your new edition…"
            : run.status === "needs_input"
              ? "A notification with the required action was sent to your ntfy topic."
              : "A notification with the error was sent to your ntfy topic. You can resume from the failed step."}
      </p>

      <ol className="stages">
        {STAGES.map((s) => {
          const p = run.progress.find((x) => x.key === s.key);
          const status = p?.status ?? "pending";
          return (
            <li key={s.key} className={`stage ${status}`}>
              <span className="icon" aria-hidden>
                {status === "done" ? <CheckIcon /> : status === "failed" ? <CloseIcon size={14} /> : null}
              </span>
              <div>
                <div className="label">{s.label}</div>
                <div className="detail">{p?.detail ?? ""}</div>
              </div>
            </li>
          );
        })}
      </ol>

      {run.status === "completed" && run.editionId && (
        <div className="done-card">
          <h2>Edition ready</h2>
          <p>Your top stories for the week have been written and verified.</p>
          <Link className="btn btn-primary" href={`/editions/${run.editionId}`}>
            Read the edition →
          </Link>
        </div>
      )}

      {run.status === "failed" && (
        <div className="notice error" role="alert">
          <span className="dot" />
          <div>
            <strong>{run.error}</strong>
            <div style={{ marginTop: 12 }}>
              <button type="button" className="btn btn-primary btn-sm" onClick={retry}>
                Resume from this step
              </button>
            </div>
          </div>
        </div>
      )}

      {run.status === "needs_input" && (
        <div className="notice warn" role="alert">
          <span className="dot" />
          <div>
            {run.requiredInputs?.map((i) => (
              <p key={i.key} style={{ margin: "0 0 8px" }}>
                <strong>{i.message}</strong> {i.action}
              </p>
            ))}
            <div className="row" style={{ marginTop: 12 }}>
              <Link className="btn btn-secondary btn-sm" href="/profile">
                Open profile
              </Link>
              <button type="button" className="btn btn-primary btn-sm" onClick={retry}>
                Try again
              </button>
            </div>
          </div>
        </div>
      )}

      {netError && run.status === "running" && (
        <div className="notice error" role="alert">
          <span className="dot" />
          <div>
            <strong>Lost connection to the generator ({netError}).</strong> The run is saved; reload this page to continue.
          </div>
        </div>
      )}

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
