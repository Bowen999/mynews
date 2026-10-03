"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { startNavigationProgress } from "./NavigationProgress";
import { forgetRun } from "./RunDriver";
import { toast } from "./Toast";
import { useTheme } from "./ThemeToggle";

export function AccountMenu({ email, isAdmin }: { email: string; isAdmin: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const [theme, toggleTheme] = useTheme();
  const ref = useRef<HTMLDetailsElement>(null);
  const [requesting, setRequesting] = useState(false);
  const [navigating, startTransition] = useTransition();
  const busy = requesting || navigating;

  const close = () => ref.current?.removeAttribute("open");

  // Close on navigation, on a click outside the menu, and on Escape.
  useEffect(() => {
    ref.current?.removeAttribute("open");
  }, [pathname]);
  useEffect(() => {
    const details = ref.current;
    if (!details) return;
    const onPointer = (e: PointerEvent) => {
      if (details.open && !details.contains(e.target as Node)) details.removeAttribute("open");
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || !details.open) return;
      details.removeAttribute("open");
      details.querySelector("summary")?.focus();
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  const signOut = async () => {
    setRequesting(true);
    try {
      const res = await fetch("/api/auth/logout", { method: "POST" });
      if (!res.ok) throw new Error();
      forgetRun();
      toast("Signed out.");
      startNavigationProgress();
      startTransition(() => {
        router.replace("/");
        router.refresh();
      });
    } catch {
      toast.error("Couldn’t sign out. Try again.");
    } finally {
      setRequesting(false);
    }
  };

  return (
    <details className="account" ref={ref}>
      <summary className="icon-btn" aria-label={`Account: ${email}`} aria-haspopup="menu">
        <span aria-hidden>{email.slice(0, 1).toUpperCase()}</span>
      </summary>
      <div className="account-menu" role="menu">
        <div className="account-email">
          {email}
          {isAdmin && <span className="label muted"> · Admin</span>}
        </div>
        <Link href="/profile" role="menuitem" onClick={close}>
          Profile &amp; settings
        </Link>
        {isAdmin && (
          <Link href="/admin" role="menuitem" onClick={close}>
            Admin
          </Link>
        )}
        {/* The header's switch is hidden on phones to make room, so it lives here instead. */}
        <button type="button" role="menuitem" className="account-theme" onClick={toggleTheme}>
          {theme === "dark" ? "Light mode" : "Dark mode"}
        </button>
        <button type="button" role="menuitem" onClick={signOut} disabled={busy} aria-busy={busy}>
          {busy && <span className="spinner" />} {busy ? "Signing out…" : "Sign out"}
        </button>
      </div>
    </details>
  );
}
