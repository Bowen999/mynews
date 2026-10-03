import { ViewTransition } from "react";

/**
 * Wraps a page (and its loading skeleton) so navigations fade the old page out and the new one in.
 * Links tagged with transitionTypes "nav-forward" / "nav-back" (next / previous story) slide sideways
 * instead. Refreshes and in-place updates don't animate. Browsers without the View Transitions API,
 * and readers who prefer reduced motion, get an instant swap.
 */
export function PageTransition({ children }: { children: React.ReactNode }) {
  return (
    <ViewTransition
      enter={{ "nav-forward": "slide-forward", "nav-back": "slide-back", default: "page-enter" }}
      exit={{ "nav-forward": "slide-forward", "nav-back": "slide-back", default: "page-exit" }}
      default="none"
    >
      {children}
    </ViewTransition>
  );
}

/** A page's outer `.wrap` element, animated on navigation. */
export function Page({ className = "wrap", children }: { className?: string; children: React.ReactNode }) {
  return (
    <PageTransition>
      <div className={className}>{children}</div>
    </PageTransition>
  );
}
