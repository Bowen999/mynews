const DAY = 24 * 60 * 60 * 1000;

export interface Window {
  start: Date;
  end: Date;
}

/** The previous 7 days, ending now. */
export function previousWeekWindow(now = new Date()): Window {
  return { start: new Date(now.getTime() - 7 * DAY), end: now };
}

export function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Parse assorted date strings (ISO, RFC 2822, "YYYY-MM-DD", "2 days ago", Chinese dates).
 * Returns undefined when the date cannot be determined confidently.
 */
export function parseDate(input: unknown, now = new Date()): Date | undefined {
  if (input == null) return undefined;
  if (input instanceof Date) return isNaN(input.getTime()) ? undefined : input;
  if (typeof input === "number") {
    const d = new Date(input > 1e12 ? input : input * 1000);
    return isNaN(d.getTime()) ? undefined : d;
  }
  if (typeof input !== "string") return undefined;
  const s = input.trim();
  if (!s) return undefined;

  const rel = s.match(/^(\d+)\s*(minute|min|hour|hr|day|week)s?\s+ago$/i);
  if (rel) {
    const n = Number(rel[1]);
    const unit = rel[2].toLowerCase();
    const ms = unit.startsWith("min") ? 60e3 : unit.startsWith("h") ? 3600e3 : unit === "day" ? DAY : 7 * DAY;
    return new Date(now.getTime() - n * ms);
  }
  if (/^yesterday$/i.test(s)) return new Date(now.getTime() - DAY);
  if (/^today$/i.test(s)) return now;

  const zh = s.match(/(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/);
  if (zh) return utcDate(Number(zh[1]), Number(zh[2]), Number(zh[3]));

  const ymd = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (ymd) return utcDate(Number(ymd[1]), Number(ymd[2]), Number(ymd[3]));

  const d = new Date(s);
  if (!isNaN(d.getTime())) return d;
  return undefined;
}

function utcDate(y: number, m: number, d: number): Date | undefined {
  if (m < 1 || m > 12 || d < 1 || d > 31) return undefined;
  const date = new Date(Date.UTC(y, m - 1, d, 12));
  return isNaN(date.getTime()) ? undefined : date;
}

/**
 * Whether a date falls in the window. A date-only value (noon UTC) is accepted if its day
 * overlaps the window; small clock skew into the future is tolerated.
 */
export function inWindow(date: Date | undefined, w: Window): boolean {
  if (!date) return false;
  const t = date.getTime();
  return t >= w.start.getTime() - 12 * 3600e3 && t <= w.end.getTime() + 36 * 3600e3;
}

export function formatDay(iso: string | undefined, locale = "en-US"): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString(locale, { month: "short", day: "numeric", timeZone: "UTC" });
}

export function formatRange(startIso: string, endIso: string, locale = "en-US"): string {
  const s = new Date(startIso);
  const e = new Date(endIso);
  const sameYear = s.getUTCFullYear() === e.getUTCFullYear();
  const startStr = s.toLocaleDateString(locale, { month: "short", day: "numeric", timeZone: "UTC" });
  const endStr = e.toLocaleDateString(locale, { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
  return sameYear ? `${startStr} – ${endStr}` : `${s.toLocaleDateString(locale, { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })} – ${endStr}`;
}
