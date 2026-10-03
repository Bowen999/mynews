"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const START_EVENT = "mynews:navigation-start";

/** Show the top progress bar for a programmatic navigation (call right before router.push / replace). */
export function startNavigationProgress() {
  window.dispatchEvent(new Event(START_EVENT));
}

/** True for a plain left click on a same-site link to another page (not a new tab, download or #hash). */
function isPageNavigation(e: MouseEvent): boolean {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return false;
  const a = (e.target as Element | null)?.closest?.("a[href]");
  if (!(a instanceof HTMLAnchorElement)) return false;
  if ((a.target && a.target !== "_self") || a.hasAttribute("download") || a.dataset.noProgress !== undefined) return false;
  const url = new URL(a.href, window.location.href);
  if (url.origin !== window.location.origin) return false;
  return url.pathname !== window.location.pathname || url.search !== window.location.search;
}

interface NavigationApi {
  addEventListener(type: "currententrychange", cb: () => void): void;
  removeEventListener(type: "currententrychange", cb: () => void): void;
}

/**
 * A thin bar at the top of the window while the next page is on its way. It appears only if the
 * navigation takes longer than ~120 ms, so prefetched pages never flash it.
 */
export function NavigationProgress() {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const [bar, setBar] = useState<{ value: number; done: boolean } | null>(null);
  const finishRef = useRef<() => void>(() => undefined);

  useEffect(() => {
    let running = false;
    let shown = false;
    let showTimer = 0;
    let trickle = 0;
    let safety = 0;
    let hideTimer = 0;
    const clear = () => {
      window.clearTimeout(showTimer);
      window.clearInterval(trickle);
      window.clearTimeout(safety);
      window.clearTimeout(hideTimer);
    };
    const finish = () => {
      if (!running) return;
      running = false;
      clear();
      if (!shown) return setBar(null);
      setBar({ value: 1, done: true });
      hideTimer = window.setTimeout(() => setBar(null), 450);
    };
    const start = () => {
      clear();
      running = true;
      shown = false;
      showTimer = window.setTimeout(() => {
        shown = true;
        setBar({ value: 0.14, done: false });
        trickle = window.setInterval(() => setBar((b) => (b && !b.done ? { value: b.value + (0.9 - b.value) * 0.07, done: false } : b)), 220);
      }, 120);
      // Never leave a bar hanging (a download, an aborted request, an older browser).
      safety = window.setTimeout(finish, 12_000);
    };
    const onClick = (e: MouseEvent) => {
      if (isPageNavigation(e)) start();
    };
    // History updates also end a navigation that lands on the same URL (e.g. a redirect back). The
    // router writes history during React's commit, so finish once that has returned.
    const onHistory = () => window.setTimeout(finish, 0);
    const nav = (window as unknown as { navigation?: NavigationApi }).navigation;
    document.addEventListener("click", onClick, true);
    window.addEventListener(START_EVENT, start);
    window.addEventListener("pageshow", finish);
    nav?.addEventListener("currententrychange", onHistory);
    finishRef.current = finish;
    return () => {
      clear();
      document.removeEventListener("click", onClick, true);
      window.removeEventListener(START_EVENT, start);
      window.removeEventListener("pageshow", finish);
      nav?.removeEventListener("currententrychange", onHistory);
    };
  }, []);

  useEffect(() => {
    finishRef.current();
  }, [pathname, search]);

  return (
    <div className="nav-progress" aria-hidden data-state={bar ? (bar.done ? "done" : "loading") : "idle"}>
      {bar && <span style={{ transform: `scaleX(${bar.value})` }} />}
    </div>
  );
}
