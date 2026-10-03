"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { OAUTH_PROVIDERS, type OAuthProvider } from "@/lib/auth/providers";
import { EyeIcon, EyeOffIcon, GitHubMark, GoogleMark } from "./Icons";
import { startNavigationProgress } from "./NavigationProgress";
import { toast } from "./Toast";

type Mode = "login" | "signup" | "forgot" | "reset";

const COPY: Record<Mode, { title: string; button: string; busy: string }> = {
  login: { title: "Sign in", button: "Sign in", busy: "Signing in…" },
  signup: { title: "Create your account", button: "Create account", busy: "Creating account…" },
  forgot: { title: "Reset your password", button: "Send reset link", busy: "Sending…" },
  reset: { title: "Choose a new password", button: "Save new password", busy: "Saving…" },
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function safeNext(v: string | null): string {
  return v && v.startsWith("/") && !v.startsWith("//") && !v.startsWith("/\\") ? v : "/";
}

type Field = "email" | "password";

/** Client-side checks that mirror the server's, so mistakes show up before a round trip. */
function validate(mode: Mode, email: string, password: string): Partial<Record<Field, string>> {
  const errors: Partial<Record<Field, string>> = {};
  if (mode !== "reset") {
    if (!email.trim()) errors.email = "Enter your email address.";
    else if (!EMAIL.test(email.trim())) errors.email = "That doesn’t look like an email address.";
  }
  if (mode !== "forgot") {
    if (!password) errors.password = mode === "login" ? "Enter your password." : "Choose a password.";
    else if (mode !== "login" && password.length < 8) errors.password = "Use at least 8 characters.";
    else if (password.length > 128) errors.password = "Use at most 128 characters.";
  }
  return errors;
}

/** "Continue with GitHub / Google": plain form posts, so they also work before JavaScript loads. */
function ProviderButtons({ providers, next }: { providers: OAuthProvider[]; next: string }) {
  const [redirecting, setRedirecting] = useState<OAuthProvider | null>(null);
  // Returning with the Back button restores this page from the browser cache: re-enable the buttons.
  useEffect(() => {
    const reset = (e: PageTransitionEvent) => e.persisted && setRedirecting(null);
    window.addEventListener("pageshow", reset);
    return () => window.removeEventListener("pageshow", reset);
  }, []);
  const query = next === "/" ? "" : `?next=${encodeURIComponent(next)}`;
  return (
    <div className="oauth">
      {providers.map((p) => (
        <form
          key={p}
          method="post"
          action={`/api/auth/oauth/${p}${query}`}
          onSubmit={(e) => {
            if (redirecting) e.preventDefault();
            else setRedirecting(p);
          }}
        >
          <button type="submit" className="btn btn-oauth" disabled={redirecting !== null && redirecting !== p} aria-busy={redirecting === p}>
            {redirecting === p ? <span className="spinner" /> : p === "github" ? <GitHubMark /> : <GoogleMark />}
            {redirecting === p ? `Redirecting to ${OAUTH_PROVIDERS[p].label}…` : `Continue with ${OAUTH_PROVIDERS[p].label}`}
          </button>
        </form>
      ))}
      <div className="auth-or" role="separator">
        or with email
      </div>
    </div>
  );
}

export function AuthForm({ mode, providers = [] }: { mode: Mode; providers?: OAuthProvider[] }) {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const nextQuery = next === "/" ? "" : `?next=${encodeURIComponent(next)}`;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [error, setError] = useState<string | null>(params.get("error"));
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [requesting, setRequesting] = useState(false);
  // Stays pending until the next page has rendered, so the button keeps its spinner until then.
  const [navigating, startTransition] = useTransition();
  const busy = requesting || navigating;
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const found = validate(mode, email, password);
    setErrors(found);
    if (found.email || found.password) {
      (found.email ? emailRef : passwordRef).current?.focus();
      return;
    }
    setRequesting(true);
    setError(null);
    const endpoint = { login: "/api/auth/login", signup: "/api/auth/signup", forgot: "/api/auth/forgot", reset: "/api/auth/password" }[mode];
    const body = mode === "forgot" ? { email } : mode === "reset" ? { password } : { email, password };
    try {
      const res = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Something went wrong. Try again.");
        if (res.status === 401) passwordRef.current?.select();
        return;
      }
      if (mode === "forgot" || (mode === "signup" && data.needsConfirmation)) {
        setSentTo(email.trim());
        return;
      }
      toast.success(
        mode === "login" ? "Signed in." : mode === "signup" ? "Account created. Add a source to begin." : "Password updated.",
      );
      startNavigationProgress();
      startTransition(() => {
        router.replace(mode === "signup" ? "/profile" : mode === "reset" ? "/" : next);
        router.refresh();
      });
    } catch {
      setError("Can’t reach the server. Try again.");
    } finally {
      setRequesting(false);
    }
  };

  if (sentTo) {
    return (
      <div className="auth-form" role="status">
        <h2>{mode === "forgot" ? "Check your email" : "Confirm your email"}</h2>
        <p className="auth-sent">
          {mode === "forgot" ? (
            <>
              If <b>{sentTo}</b> has an account, a reset link is on its way.
            </>
          ) : (
            <>
              Open the link we sent to <b>{sentTo}</b> to finish.
            </>
          )}{" "}
          Not there? Check spam.
        </p>
        <p className="alt">
          <button type="button" className="link-button" onClick={() => setSentTo(null)}>
            Use a different email
          </button>
          {" · "}
          <Link className="link" href={`/login${nextQuery}`}>
            Back to sign in
          </Link>
        </p>
      </div>
    );
  }

  const fieldError = (f: Field) =>
    errors[f] ? (
      <small className="field-error" id={`${f}-error`}>
        {errors[f]}
      </small>
    ) : null;
  const clearError = (f: Field) => errors[f] && setErrors({ ...errors, [f]: undefined });
  const trackCaps = (e: React.KeyboardEvent) => setCapsLock(e.getModifierState?.("CapsLock") ?? false);

  return (
    <div className="auth-form">
      <h2>{COPY[mode].title}</h2>
      {providers.length > 0 && (mode === "login" || mode === "signup") && <ProviderButtons providers={providers} next={next} />}
      <form className="auth-fields" onSubmit={submit} noValidate>
        {mode !== "reset" && (
          <div className="field">
            <label className="field-label" htmlFor="auth-email">
              Email
            </label>
            <input
              ref={emailRef}
              id="auth-email"
              className="input"
              type="email"
              inputMode="email"
              autoComplete="email"
              required
              value={email}
              aria-invalid={Boolean(errors.email)}
              aria-describedby={errors.email ? "email-error" : undefined}
              onChange={(e) => {
                setEmail(e.target.value);
                clearError("email");
              }}
              autoFocus
            />
            {fieldError("email")}
          </div>
        )}
        {mode !== "forgot" && (
          <div className="field">
            <label className="field-label" htmlFor="auth-password">
              {mode === "reset" ? "New password" : "Password"}
            </label>
            <div className="password">
              <input
                ref={passwordRef}
                id="auth-password"
                className="input"
                type={showPassword ? "text" : "password"}
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                required
                minLength={mode === "login" ? undefined : 8}
                value={password}
                aria-invalid={Boolean(errors.password)}
                aria-describedby={errors.password ? "password-error" : mode !== "login" ? "password-hint" : undefined}
                onChange={(e) => {
                  setPassword(e.target.value);
                  clearError("password");
                }}
                onKeyDown={trackCaps}
                onKeyUp={trackCaps}
                onBlur={() => setCapsLock(false)}
                autoFocus={mode === "reset"}
              />
              <button
                type="button"
                className="reveal"
                aria-label={showPassword ? "Hide password" : "Show password"}
                aria-pressed={showPassword}
                onClick={() => setShowPassword((v) => !v)}
              >
                {showPassword ? <EyeOffIcon /> : <EyeIcon />}
              </button>
            </div>
            {fieldError("password") ??
              (capsLock ? (
                <small className="field-warn">Caps Lock is on.</small>
              ) : (
                mode !== "login" && <small id="password-hint">At least 8 characters.</small>
              ))}
          </div>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="row" style={{ alignItems: "center", justifyContent: "space-between" }}>
          <button className="btn btn-solid" type="submit" disabled={busy} aria-busy={busy}>
            {busy && <span className="spinner" />} {busy ? COPY[mode].busy : COPY[mode].button} {!busy && <span className="arrow">→</span>}
          </button>
          {mode === "login" && (
            <Link className="link alt" href="/forgot-password">
              Forgot password?
            </Link>
          )}
        </div>
      </form>
      <p className="alt">
        {mode === "login" && (
          <>
            New here?{" "}
            <Link className="link" href={`/signup${nextQuery}`}>
              Create an account
            </Link>
          </>
        )}
        {mode === "signup" && (
          <>
            Already have an account?{" "}
            <Link className="link" href={`/login${nextQuery}`}>
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
    </div>
  );
}
