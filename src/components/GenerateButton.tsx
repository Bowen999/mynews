"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { RequiredInput } from "@/lib/types";

interface Blocker {
  title: string;
  inputs: RequiredInput[];
}

export function BlockerDialog({ blocker, onClose }: { blocker: Blocker | null; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (blocker && !d.open) d.showModal();
    if (!blocker && d.open) d.close();
  }, [blocker]);
  const needsSources = blocker?.inputs.some((i) => i.key.startsWith("SOURCES"));
  return (
    <dialog ref={ref} className="modal" onClose={onClose} onClick={(e) => e.target === ref.current && ref.current?.close()}>
      <div className="modal-body">
        <div className="label muted">{blocker?.title === "Limit reached" ? "Usage limit" : "Input required"}</div>
        <h2>{blocker?.title === "Limit reached" ? "You’ve reached this week’s limit" : "Before we can write your briefing"}</h2>
        <ul>
          {blocker?.inputs.map((i) => (
            <li key={i.key}>
              <b>{i.message}</b>
              {i.action && <span>{i.action}</span>}
            </li>
          ))}
        </ul>
        <div className="row">
          <button type="button" className="btn btn-quiet" onClick={() => ref.current?.close()}>
            Close
          </button>
          {needsSources && (
            <Link className="btn btn-solid" href="/profile" onClick={() => ref.current?.close()}>
              Add sources <span className="arrow">→</span>
            </Link>
          )}
        </div>
      </div>
    </dialog>
  );
}

/** The classic variants render the rounded buttons of the home page (red, or white for a secondary action). */
export function GenerateButton({
  size = "md",
  variant = "editorial",
}: {
  size?: "md" | "lg";
  variant?: "editorial" | "classic" | "classic-secondary";
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [blocker, setBlocker] = useState<Blocker | null>(null);

  const start = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/runs", { method: "POST" });
      const data = await res.json();
      if (res.status === 401) router.push("/login?next=/");
      else if (res.status === 409 || res.status === 429) setBlocker({ title: data.error, inputs: data.requiredInputs ?? [] });
      else if (!res.ok) setBlocker({ title: "Error", inputs: [{ key: "ERROR", message: data.error ?? "Could not start." }] });
      else router.push(`/runs/${data.run.id}`);
    } catch (e) {
      setBlocker({ title: "Error", inputs: [{ key: "ERROR", message: e instanceof Error ? e.message : "Network error" }] });
    } finally {
      setBusy(false);
    }
  };

  if (variant !== "editorial") {
    return (
      <>
        <button
          type="button"
          className={`cl-btn ${variant === "classic" ? "cl-btn-primary" : "cl-btn-secondary"} ${size === "lg" ? "cl-btn-lg" : "cl-btn-sm"}`}
          onClick={start}
          disabled={busy}
          aria-label="Generate Weekly Briefing"
        >
          {busy && <span className="cl-spinner" />}
          Generate Weekly Briefing
        </button>
        <BlockerDialog blocker={blocker} onClose={() => setBlocker(null)} />
      </>
    );
  }

  return (
    <>
      <button
        type="button"
        className={`btn btn-solid ${size === "lg" ? "btn-lg" : "btn-sm"}`}
        onClick={start}
        disabled={busy}
        aria-label="Generate Weekly Briefing"
      >
        {busy ? <span className="spinner" /> : <span aria-hidden>＋</span>}
        <span className="label-full">Generate Weekly Briefing</span>
      </button>
      <BlockerDialog blocker={blocker} onClose={() => setBlocker(null)} />
    </>
  );
}
