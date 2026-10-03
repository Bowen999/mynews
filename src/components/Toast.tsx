"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { CheckIcon, CloseIcon } from "./Icons";
import { flashMessage, FLASH_COOKIE } from "@/lib/auth/providers";

export type ToastKind = "info" | "success" | "error";

export interface ToastOptions {
  /** A single follow-up action, such as "Undo". */
  action?: { label: string; onClick: () => void };
  /** Milliseconds before the toast hides itself (paused while hovered or focused). */
  duration?: number;
}

interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
  action?: ToastOptions["action"];
  duration: number;
  leaving?: boolean;
}

// A tiny module-level store, so any client component can raise a toast without a provider.
let items: ToastItem[] = [];
let nextId = 1;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const EMPTY: ToastItem[] = [];

function push(kind: ToastKind, message: string, opts: ToastOptions = {}): number {
  const id = nextId++;
  const duration = opts.duration ?? (kind === "error" ? 7000 : opts.action ? 6000 : 4000);
  // The same message again replaces the old one instead of stacking; at most three are shown.
  items = [...items.filter((t) => t.message !== message), { id, kind, message, action: opts.action, duration }].slice(-3);
  emit();
  return id;
}

function dismiss(id: number) {
  if (!items.some((t) => t.id === id && !t.leaving)) return;
  items = items.map((t) => (t.id === id ? { ...t, leaving: true } : t));
  emit();
  window.setTimeout(() => {
    items = items.filter((t) => t.id !== id);
    emit();
  }, 180);
}

/** Short, non-blocking confirmation of what just happened. */
export const toast = Object.assign((message: string, opts?: ToastOptions) => push("info", message, opts), {
  success: (message: string, opts?: ToastOptions) => push("success", message, opts),
  error: (message: string, opts?: ToastOptions) => push("error", message, opts),
  dismiss,
});

function readFlash(): string | null {
  const m = document.cookie.match(new RegExp(`(?:^|; )${FLASH_COOKIE}=([^;]*)`));
  if (!m) return null;
  document.cookie = `${FLASH_COOKIE}=; Max-Age=0; path=/; SameSite=Lax`;
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return null;
  }
}

function Toast({ t }: { t: ToastItem }) {
  const [paused, setPaused] = useState(false);
  const remaining = useRef(t.duration);
  useEffect(() => {
    if (paused || t.leaving) return;
    const started = Date.now();
    const timer = window.setTimeout(() => dismiss(t.id), remaining.current);
    return () => {
      window.clearTimeout(timer);
      remaining.current -= Date.now() - started;
    };
  }, [paused, t.id, t.leaving]);

  return (
    <li
      className={`toast toast-${t.kind}`}
      data-leaving={t.leaving || undefined}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      {t.kind === "success" && (
        <span className="toast-icon" aria-hidden>
          <CheckIcon size={15} />
        </span>
      )}
      <span className="toast-text">{t.message}</span>
      {t.action && (
        <button
          type="button"
          className="toast-action"
          onClick={() => {
            t.action?.onClick();
            dismiss(t.id);
          }}
        >
          {t.action.label}
        </button>
      )}
      <button type="button" className="toast-close" aria-label="Dismiss" onClick={() => dismiss(t.id)}>
        <CloseIcon size={14} />
      </button>
    </li>
  );
}

/**
 * The toast region (mounted once in the root layout). Also shows one-off messages that the server
 * leaves in a short-lived cookie when it redirects, e.g. after signing in with GitHub.
 */
export function Toaster() {
  const list = useSyncExternalStore(subscribe, () => items, () => EMPTY);
  const pathname = usePathname();

  useEffect(() => {
    const key = readFlash();
    const message = key && flashMessage(key);
    if (message) toast.success(message);
  }, [pathname]);

  // Two live regions that always exist, so screen readers announce what is added to them.
  return (
    <div className="toasts">
      <ol aria-live="polite" aria-label="Notifications">
        {list.filter((t) => t.kind !== "error").map((t) => (
          <Toast key={t.id} t={t} />
        ))}
      </ol>
      <ol aria-live="assertive" aria-label="Errors">
        {list.filter((t) => t.kind === "error").map((t) => (
          <Toast key={t.id} t={t} />
        ))}
      </ol>
    </div>
  );
}
