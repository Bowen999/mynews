import type { DayBucket } from "@/lib/admin";
import { formatDay } from "@/lib/util/dates";

const W = 10; // SVG units per day
const GAP = 2.4;

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * Generations per day as stacked bars. The SVG stretches to the page's width, so the labels are
 * plain HTML (they stay sharp), and each day's column carries a tooltip with its numbers.
 */
export function DailyChart({ days }: { days: DayBucket[] }) {
  const totals = days.map((d) => d.completed + d.failed + d.other);
  const max = Math.max(1, ...totals);
  const all = totals.reduce((a, b) => a + b, 0);
  const peak = totals.indexOf(Math.max(...totals));
  const summary = all
    ? `Generations per day over the last ${days.length} days: ${plural(all, "generation")} in all, most on ${formatDay(days[peak].day)} (${totals[peak]}).`
    : `No generations in the last ${days.length} days.`;
  const mid = days[Math.floor(days.length / 2)];

  return (
    <figure className="chart">
      <div className="chart-plot">
        <span className="chart-max" aria-hidden>
          {max}
        </span>
        <svg viewBox={`0 0 ${days.length * W} 100`} preserveAspectRatio="none" role="img" aria-label={summary}>
          {days.map((d, i) => {
            const x = i * W + GAP / 2;
            let y = 100;
            const stack = (n: number, kind: string) => {
              if (!n) return null;
              const h = (n / max) * 100;
              y -= h;
              return <rect key={kind} className={`bar-${kind}`} x={x} y={y} width={W - GAP} height={h} />;
            };
            const parts = [d.completed && `${d.completed} completed`, d.failed && `${d.failed} failed`, d.other && `${d.other} other`].filter(Boolean);
            return (
              <g key={d.day}>
                <title>{`${formatDay(d.day)} · ${parts.length ? parts.join(", ") : "none"}`}</title>
                <rect className="chart-hit" x={i * W} y={0} width={W} height={100} />
                {stack(d.completed, "ok")}
                {stack(d.failed, "fail")}
                {stack(d.other, "other")}
              </g>
            );
          })}
        </svg>
      </div>
      <div className="chart-axis" aria-hidden>
        <span>{formatDay(days[0].day)}</span>
        <span>{formatDay(mid.day)}</span>
        <span>Today</span>
      </div>
      <figcaption className="chart-legend">
        <span className="ok">Completed</span>
        <span className="fail">Failed</span>
        <span className="other">Running or waiting</span>
      </figcaption>
    </figure>
  );
}
