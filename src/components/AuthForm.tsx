"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

type Mode = "login" | "signup" | "forgot" | "reset";

const COPY: Record<Mode, { title: string; button: string }> = {
  login: { title: "Sign in", button: "Sign in" },
  signup: { title: "Create your account", button: "Create account" },
  forgot: { title: "Reset your password", button: "Send reset link" },
  reset: { title: "Choose a new password", button: "Save new password" },
};

function safeNext(v: string | null): string {
  return v && v.startsWith("/") && !v.startsWith("//") ? v : "/";
}

export function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(params.get("error"));
  const [done, setDone] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const endpoint = { login: "/api/auth/login", signup: "/api/auth/signup", forgot: "/api/auth/forgot", reset: "/api/auth/password" }[mode];
    const body = mode === "forgot" ? { email } : mode === "reset" ? { password } : { email, password };
    try {
      const res = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Something went wrong. Try again.");
        return;
      }
      if (mode === "forgot") setDone("If an account exists for that email, a reset link is on its way.");
      else if (mode === "signup" && data.needsConfirmation) setDone("Check your inbox and open the confirmation link to finish creating your account.");
      else if (mode === "reset") {
        setDone("Password updated.");
        router.replace("/");
        router.refresh();
      } else {
        router.replace(mode === "signup" ? "/profile" : safeNext(params.get("next")));
        router.refresh();
      }
    } catch {
      setError("Network error. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="auth-form" onSubmit={submit} noValidate>
      <h2>{COPY[mode].title}</h2>
      {mode !== "reset" && (
        <label className="field">
          <span>Email</span>
          <input className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
        </label>
      )}
      {mode !== "forgot" && (
        <label className="field">
          <span>{mode === "reset" ? "New password" : "Password"}</span>
          <input
            className="input"
            type="password"
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {mode !== "login" && <small>At least 8 characters.</small>}
        </label>
      )}
      {error && <p className="form-error" role="alert">{error}</p>}
      {done && <p className="form-ok" role="status">{done}</p>}
      <div className="row" style={{ alignItems: "center", justifyContent: "space-between" }}>
        <button className="btn btn-solid" type="submit" disabled={busy}>
          {busy && <span className="spinner" />} {COPY[mode].button} <span className="arrow">→</span>
        </button>
        {mode === "login" && (
          <Link className="link alt" href="/forgot-password">
            Forgot password?
          </Link>
        )}
      </div>
      <p className="alt">
        {mode === "login" && (
          <>
            New here?{" "}
            <Link className="link" href="/signup">
              Create an account
            </Link>
          </>
        )}
        {mode === "signup" && (
          <>
            Already have an account?{" "}
            <Link className="link" href="/login">
              Sign in
            </Link>
          </>
        )}
        {mode === "forgot" && (
          <Link className="link" href="/login">
            Back to sign in
          </Link>
        )}
      </p>
    </form>
  );
}
