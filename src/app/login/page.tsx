"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) });
    setBusy(false);
    if (!res.ok) {
      setError("That password is not correct.");
      return;
    }
    const next = params.get("next");
    router.replace(next && next.startsWith("/") && !next.startsWith("//") ? next : "/");
    router.refresh();
  };

  return (
    <div className="login">
      <form onSubmit={submit}>
        <h1>
          MyNews<span style={{ color: "var(--accent)" }}>.</span>
        </h1>
        <p style={{ color: "var(--text-2)", margin: "0 0 12px" }}>Enter the password to read your briefings.</p>
        <input className="input" type="password" autoFocus autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} aria-label="Password" />
        {error && <p className="error-text">{error}</p>}
        <button className="btn btn-primary" type="submit" disabled={!password || busy}>
          {busy && <span className="spinner" />} Continue
        </button>
      </form>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
