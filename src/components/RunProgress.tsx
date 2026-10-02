"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { RunView } from "@/lib/run-view";
import { STAGES } from "@/lib/types";
import { formatRange } from "@/lib/util/dates";

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

  const STATUS_LABEL = { pending: "Waiting", active: "Working", done: "Done", failed: "Stopped" } as const;

  return (
    <div className="wrap">
      <header className="page-head">
        <div className="label">Weekly Briefing · {formatRange(run.windowStart, run.windowEnd)}</div>
        <h1 className="title-xl">{title}</h1>
        <p className="dek">
          {run.status === "running"
            ? "Searching the past seven days, verifying sources and writing your top ten. This usually takes two to five minutes. Keep this tab open."
            : run.status === "completed"
              ? "Opening your new edition…"
              : run.status === "needs_input"
                ? "Something needs your attention before the briefing can continue."
                : "The run is saved. You can resume from the step that stopped."}
        </p>
      </header>

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
              <button type="button" className="btn btn-solid btn-sm" onClick={retry}>
                Resume from this step
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
              <button type="button" className="btn btn-solid btn-sm" onClick={retry}>
                Try again
              </button>
            </div>
          </div>
        )}
        {netError && run.status === "running" && (
          <div className="notice error" role="alert">
            <strong>Lost connection to the generator ({netError}).</strong> The run is saved; reload this page to continue.
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
