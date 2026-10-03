"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import type { RequiredInput } from "@/lib/types";
import { confirmUnsaved } from "@/lib/unsaved";
import { startNavigationProgress } from "./NavigationProgress";
import { toast } from "./Toast";

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
  const [requesting, setRequesting] = useState(false);
  // Stays pending until the progress page has rendered, so the button can't be pressed twice.
  const [navigating, startTransition] = useTransition();
  const [blocker, setBlocker] = useState<Blocker | null>(null);
  const busy = requesting || navigating;

  const start = async () => {
    if (busy || !confirmUnsaved("The briefing uses your saved profile. Generate anyway?")) return;
    setRequesting(true);
    try {
      const res = await fetch("/api/runs", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        toast("Your session ended. Sign in to generate a briefing.");
        startNavigationProgress();
        startTransition(() => router.push("/login?next=/"));
      } else if (res.status === 409 || res.status === 429) setBlocker({ title: data.error, inputs: data.requiredInputs ?? [] });
      else if (!res.ok) setBlocker({ title: "Error", inputs: [{ key: "ERROR", message: data.error ?? "Could not start." }] });
      else {
        if (data.resumed) toast("A briefing is already being generated. Here is its progress.");
        startNavigationProgress();
        startTransition(() => router.push(`/runs/${data.run.id}`));
      }
    } catch {
      toast.error("Could not reach the server. Check your connection and try again.");
    } finally {
      setRequesting(false);
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
          aria-busy={busy}
          aria-label="Generate Weekly Briefing"
        >
          {busy && <span className="cl-spinner" />}
          {busy ? "Starting…" : "Generate Weekly Briefing"}
        </button>
        <BlockerDialog blocker={blocker} onClose={() => setBlocker(null)} />
      </>
    );
  }

  return (
    <>
      <button
        type="button"
        className={`btn btn-solid btn-generate ${size === "lg" ? "btn-lg" : "btn-sm"}`}
        onClick={start}
        disabled={busy}
        aria-busy={busy}
        aria-label="Generate Weekly Briefing"
      >
        {busy ? <span className="spinner" /> : <span aria-hidden>＋</span>}
        <span className="label-full">Generate Weekly Briefing</span>
      </button>
      <BlockerDialog blocker={blocker} onClose={() => setBlocker(null)} />
    </>
  );
}
