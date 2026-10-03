"use client";

import { useEffect, useId, useRef } from "react";

/**
 * Asks before something that can't be undone. The confirm button stays pending until the caller is
 * done, and the dialog can't be dismissed meanwhile. Focus starts on Cancel.
 */
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  pending,
  error,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  children: React.ReactNode;
  confirmLabel: string;
  pending: boolean;
  /** Shown inside the dialog, since a toast would sit behind its backdrop. */
  error?: string | null;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="modal"
      aria-labelledby={titleId}
      onCancel={(e) => pending && e.preventDefault()}
      onClose={() => {
        // A second Escape press closes a dialog whose first one was refused; keep it up until the work is done.
        if (pending && ref.current && !ref.current.open) ref.current.showModal();
        else onClose();
      }}
      onClick={(e) => e.target === ref.current && !pending && ref.current?.close()}
    >
      <div className="modal-body">
        <h2 id={titleId}>{title}</h2>
        <p className="modal-text">{children}</p>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="row">
          <button type="button" className="btn btn-quiet" disabled={pending} onClick={() => ref.current?.close()}>
            Cancel
          </button>
          <button type="button" className="btn btn-danger" disabled={pending} aria-busy={pending} onClick={onConfirm}>
            {pending && <span className="spinner" />} {confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  );
}
