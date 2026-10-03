"use client";

import { useEffect, useSyncExternalStore } from "react";
import { MoonIcon, SunIcon } from "./Icons";

const KEY = "mynews-theme";
/** The browser's toolbar color for each theme (the page starts dark; see globals.css). */
const TOOLBAR = { dark: "#0f0f0f", light: "#ffffff" } as const;

/** Dark unless the reader chose light: `data-theme="light"` is set by themeInitScript or the toggle. */
function currentTheme(): "light" | "dark" {
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

function subscribe(cb: () => void) {
  const obs = new MutationObserver(cb);
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => obs.disconnect();
}

/** The current theme and a function that switches it (and remembers the choice). */
export function useTheme(): readonly ["light" | "dark", () => void] {
  const theme = useSyncExternalStore(subscribe, currentTheme, () => "dark" as const);
  const toggle = () => {
    const next = currentTheme() === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem(KEY, next);
    } catch {
      // storage unavailable (private mode)
    }
  };
  return [theme, toggle] as const;
}

/** The header's switch. On phones signed-in readers get it in the account menu instead (see AccountMenu). */
export function ThemeToggle() {
  const [theme, toggle] = useTheme();
  useEffect(() => {
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", TOOLBAR[theme]);
  }, [theme]);
  return (
    <button type="button" className="icon-btn theme-toggle" onClick={toggle} aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}>
      {theme === "dark" ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}

/** Inline script that applies a saved choice before first paint (prevents a flash of the other theme). */
export const themeInitScript = `try{var t=localStorage.getItem('${KEY}');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch(e){}`;
