"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";

function subscribeOnline(cb: () => void) {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
}

/** Shown instead of a page that failed to render, with a way to try again in place. */
export default function ErrorPage({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  // A retry that fails again arrives as a new error object, which ends the pending state.
  const [retriedFor, setRetriedFor] = useState<Error | null>(null);
  const online = useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);
  useEffect(() => {
    console.error(error);
  }, [error]);
  const retrying = retriedFor === error;

  return (
    <div className="wrap">
      <section className="hero">
        <div className="label">{online ? "Something went wrong" : "You are offline"}</div>
        <h1 className="display" style={{ marginTop: 24 }}>
          This page didn’t load.
        </h1>
        <p className="dek">
          {online
            ? "A temporary problem stopped it from loading. Your briefings and settings are saved; trying again usually works."
            : "Check your connection, then try again. Your briefings and settings are saved."}
        </p>
        <div className="actions">
          <button
            type="button"
            className="btn btn-solid"
            disabled={retrying}
            onClick={() => {
              setRetriedFor(error);
              retry();
            }}
          >
            {retrying && <span className="spinner" />} Try again
          </button>
          <Link className="btn" href="/">
            Go to the front page
          </Link>
        </div>
        {error.digest && (
          <p className="meta" style={{ marginTop: 28 }}>
            Reference {error.digest}
          </p>
        )}
      </section>
    </div>
  );
}
