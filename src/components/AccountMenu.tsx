"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

export function AccountMenu({ email, isAdmin }: { email: string; isAdmin: boolean }) {
  const router = useRouter();
  const ref = useRef<HTMLDetailsElement>(null);
  const [busy, setBusy] = useState(false);
  const signOut = async () => {
    setBusy(true);
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    router.replace("/");
    router.refresh();
  };
  return (
    <details className="account" ref={ref}>
      <summary className="icon-btn" aria-label="Account">
        <span aria-hidden>{email.slice(0, 1).toUpperCase()}</span>
      </summary>
      <div className="account-menu" role="menu">
        <div className="account-email">
          {email}
          {isAdmin && <span className="label muted"> · Admin</span>}
        </div>
        <Link href="/profile" role="menuitem" onClick={() => ref.current?.removeAttribute("open")}>
          Profile &amp; settings
        </Link>
        <button type="button" role="menuitem" onClick={signOut} disabled={busy}>
          {busy ? "Signing out…" : "Sign out"}
        </button>
      </div>
    </details>
  );
}
