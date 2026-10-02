"use client";

import { useEffect, useState } from "react";

/** Best-effort implicit feedback (story opened / source followed); never blocks reading. */
export function trackInteraction(editionId: string, itemId: string, kind: "open" | "source") {
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
  const send = async (next: 1 | -1 | 0) => {
    const prev = signal;
    setSignal(next === 0 ? undefined : next);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ editionId, itemId, signal: next }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setSignal(prev);
    }
  };
  return (
    <div className="feedback">
      <button type="button" className="btn btn-sm" aria-pressed={signal === 1} onClick={() => send(signal === 1 ? 0 : 1)}>
        More like this
      </button>
      <button type="button" className="btn btn-sm" aria-pressed={signal === -1} onClick={() => send(signal === -1 ? 0 : -1)}>
        Less like this
      </button>
    </div>
  );
}
