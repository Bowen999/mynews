"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { RequiredInput } from "@/lib/types";
import { SparkIcon } from "./Icons";

export function InputRequiredDialog({ inputs, onClose }: { inputs: RequiredInput[] | null; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (inputs?.length && !d.open) d.showModal();
    if (!inputs?.length && d.open) d.close();
  }, [inputs]);
  return (
    <dialog ref={ref} className="modal" onClose={onClose} onClick={(e) => e.target === ref.current && ref.current?.close()}>
      <div className="modal-panel">
        <div className="kicker">Input required</div>
        <h2>Before we can write your briefing</h2>
        <p className="hint" style={{ color: "var(--text-2)", margin: 0 }}>
          A notification was sent to your ntfy topic as well.
        </p>
        <ul>
          {inputs?.map((i) => (
            <li key={i.key}>
              <b>{i.message}</b>
              {i.action && <span>{i.action}</span>}
            </li>
          ))}
        </ul>
        <div className="row">
          <button type="button" className="btn btn-ghost" onClick={() => ref.current?.close()}>
            Close
          </button>
          {inputs?.some((i) => i.key.startsWith("SOURCES")) && (
            <Link className="btn btn-primary" href="/profile" onClick={() => ref.current?.close()}>
              Add sources
            </Link>
          )}
        </div>
      </div>
    </dialog>
  );
}

export function GenerateButton({ size = "md" }: { size?: "md" | "lg" }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [inputs, setInputs] = useState<RequiredInput[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const start = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/runs", { method: "POST" });
      const data = await res.json();
      if (res.status === 409) setInputs(data.requiredInputs ?? []);
      else if (!res.ok) setError(data.error ?? "Could not start");
      else router.push(`/runs/${data.run.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button type="button" className={`btn btn-primary ${size === "lg" ? "btn-lg" : ""}`} onClick={start} disabled={busy} title={error ?? undefined}>
        {busy ? <span className="spinner" /> : <SparkIcon />}
        <span className="label-full">Generate Weekly Briefing</span>
        <span className="label-short">Generate</span>
      </button>
      {error && (
        <span role="alert" className="visually-hidden">
          {error}
        </span>
      )}
      <InputRequiredDialog inputs={inputs} onClose={() => setInputs(null)} />
    </>
  );
}
