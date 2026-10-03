"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { startNavigationProgress } from "./NavigationProgress";
import { toast } from "./Toast";

/** Best-effort implicit feedback (story opened / source followed); never blocks reading. */
function trackInteraction(editionId: string, itemId: string, kind: "open" | "source") {
  try {
    void fetch("/api/interactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ editionId, itemId, kind }),
      keepalive: true,
    }).catch(() => undefined);
  } catch {
    // tracking is best-effort
  }
}

/**
 * Implicit feedback: records that this story was opened, and which of its sources were followed
 * (links marked with data-source). Used only to rank this reader's future briefings.
 */
export function ReadTracker({ editionId, itemId, children }: { editionId: string; itemId: string; children: React.ReactNode }) {
  useEffect(() => {
    const t = setTimeout(() => trackInteraction(editionId, itemId, "open"), 1500); // ignore instant bounces
    return () => clearTimeout(t);
  }, [editionId, itemId]);
  return (
    <div
      onClickCapture={(e) => {
        const a = (e.target as HTMLElement).closest?.("a[data-source]");
        if (a) trackInteraction(editionId, itemId, "source");
      }}
      onAuxClick={(e) => {
        const a = (e.target as HTMLElement).closest?.("a[data-source]");
        if (a && e.button === 1) trackInteraction(editionId, itemId, "source");
      }}
    >
      {children}
    </div>
  );
}

/** Expandable "Detailed analysis" block. */
export function Analysis({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="analysis" data-open={open}>
      <button type="button" className="analysis-toggle" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {open ? "Hide the analysis" : "Read the detailed analysis"}
        <span className="sign" aria-hidden>
          {open ? "−" : "+"}
        </span>
      </button>
      <div className="analysis-body" aria-hidden={!open}>
        <div>{children}</div>
      </div>
    </div>
  );
}

/** "More like this / Less like this" signals that tune the next interest-profile update. */
export function FeedbackButtons({ editionId, itemId, initial }: { editionId: string; itemId: string; initial?: 1 | -1 }) {
  const [signal, setSignal] = useState<1 | -1 | undefined>(initial);
  const [pending, setPending] = useState(false);
  const send = async (next: 1 | -1 | 0) => {
    const prev = signal;
    setSignal(next === 0 ? undefined : next);
    setPending(true);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ editionId, itemId, signal: next }),
      });
      if (!res.ok) throw new Error();
      toast.success(
        next === 1
          ? "Noted. Future briefings will include more stories like this."
          : next === -1
            ? "Noted. Future briefings will show fewer stories like this."
            : "Feedback removed.",
      );
    } catch {
      setSignal(prev);
      toast.error("Couldn’t save your feedback. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  };
  return (
    <div className="feedback" aria-busy={pending}>
      <button type="button" className="btn btn-sm" aria-pressed={signal === 1} disabled={pending} onClick={() => send(signal === 1 ? 0 : 1)}>
        More like this
      </button>
      <button type="button" className="btn btn-sm" aria-pressed={signal === -1} disabled={pending} onClick={() => send(signal === -1 ? 0 : -1)}>
        Less like this
      </button>
    </div>
  );
}

/** ← / → move to the previous / next story (ignored while typing). Neighbours are prefetched. */
export function StoryKeys({ prev, next }: { prev?: string; next?: string }) {
  const router = useRouter();
  useEffect(() => {
    if (prev) router.prefetch(prev);
    if (next) router.prefetch(next);
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      const back = e.key === "ArrowLeft";
      const href = back ? prev : e.key === "ArrowRight" ? next : undefined;
      if (!href) return;
      e.preventDefault();
      startNavigationProgress();
      router.push(href, { transitionTypes: [back ? "nav-back" : "nav-forward"] });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [prev, next, router]);
  return null;
}
