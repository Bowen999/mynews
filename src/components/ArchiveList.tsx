"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { ConfirmDialog } from "./ConfirmDialog";
import { TrashIcon } from "./Icons";
import { startNavigationProgress } from "./NavigationProgress";
import { toast } from "./Toast";

export interface ArchiveRow {
  id: string;
  /** As shown, e.g. "03". */
  number: string;
  headline: string;
  meta: string;
  categories: string;
}

/** The editions, newest first. Each can be deleted after a confirmation. */
export function ArchiveList({ rows }: { rows: ArchiveRow[] }) {
  const router = useRouter();
  const [asking, setAsking] = useState<ArchiveRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Rows deleted here stay, collapsed, until the refreshed list no longer has them.
  const [gone, setGone] = useState<ReadonlySet<string>>(new Set());
  const [, startTransition] = useTransition();
  const root = useRef<HTMLDivElement>(null);
  const refreshTimer = useRef<number | undefined>(undefined);
  const focusList = useRef(false);
  useEffect(() => () => window.clearTimeout(refreshTimer.current), []);

  const shown = rows.filter((r) => !gone.has(r.id));

  const ask = (row: ArchiveRow) => {
    setError(null);
    setAsking(row);
  };

  const dialogClosed = () => {
    setAsking(null);
    setError(null);
    // The button that opened the dialog is gone by now, so keep keyboard focus on the list.
    if (focusList.current) {
      focusList.current = false;
      root.current?.focus({ preventScroll: true });
    }
  };

  const confirm = async () => {
    const row = asking;
    if (!row || deleting) return;
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/editions/${encodeURIComponent(row.id)}`, { method: "DELETE" });
      if (res.status === 401) {
        setAsking(null);
        toast("Session ended. Please sign in again.");
        startNavigationProgress();
        router.push("/login?next=/editions");
        return;
      }
      // 404: already deleted somewhere else, which is what was asked for.
      if (!res.ok && res.status !== 404) {
        setError("Couldn’t delete. Try again.");
        return;
      }
      focusList.current = true;
      setAsking(null);
      setGone((g) => new Set(g).add(row.id));
      toast.success(res.ok ? `Deleted No. ${row.number}.` : `No. ${row.number} was already deleted.`);
      // Let the row finish collapsing before the list is reloaded.
      refreshTimer.current = window.setTimeout(() => startTransition(() => router.refresh()), 320);
    } catch {
      setError("Can’t reach the server. Try again.");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div ref={root} tabIndex={-1} className="archive-list">
      {shown.length === 0 ? (
        <p className="body muted" style={{ marginTop: 40 }}>
          No editions yet.
        </p>
      ) : (
        <ol className="issues">
          {rows.map((r, i) => {
            const leaving = gone.has(r.id);
            return (
              <li key={r.id} className={`item enter${leaving ? " leaving" : ""}`} style={{ "--i": i } as React.CSSProperties} inert={leaving}>
                <div className="slot">
                  <Link href={`/editions/${r.id}`}>
                    <span className="no">{r.number}</span>
                    <span className="h">
                      <span className="title-m">{r.headline}</span>
                      <div className="meta">{r.meta}</div>
                    </span>
                    <span className="c">{r.categories}</span>
                  </Link>
                  <button type="button" className="del" aria-label={`Delete edition No. ${r.number}`} title="Delete" onClick={() => ask(r)}>
                    <TrashIcon size={18} />
                  </button>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      <ConfirmDialog
        open={asking !== null}
        title={asking ? `Delete No. ${asking.number}?` : ""}
        confirmLabel="Delete"
        pending={deleting}
        error={error}
        onConfirm={confirm}
        onClose={dialogClosed}
      >
        {asking && <>“{asking.headline}” and your ratings for its stories will be deleted. This can’t be undone.</>}
      </ConfirmDialog>
    </div>
  );
}
