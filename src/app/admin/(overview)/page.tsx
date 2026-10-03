import type { Metadata } from "next";
import Link from "next/link";
import { DailyChart } from "@/components/AdminCharts";
import { AdminNav } from "@/components/AdminNav";
import { Figure, Figures, Section } from "@/components/AdminParts";
import { PAGE_HEADS, PageHead } from "@/components/PageHead";
import { Page } from "@/components/PageTransition";
import { loadAdminData, overview } from "@/lib/admin";
import { config } from "@/lib/config";
import { requireAdminPage } from "@/lib/session";
import { systemStatus } from "@/lib/status";
import { formatAgo, formatDuration } from "@/lib/util/dates";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Admin" };

/** The big number and unit for a duration, e.g. 3.2 min. */
function typical(ms: number | null): { value: string; unit?: string } {
  if (ms === null) return { value: "—" };
  const s = ms / 1000;
  if (s < 60) return { value: String(Math.round(s)), unit: "s" };
  if (s < 3600) return { value: String(+(s / 60).toFixed(s < 600 ? 1 : 0)), unit: "min" };
  return { value: String(+(s / 3600).toFixed(1)), unit: "h" };
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Statistics across all accounts. Admins only (accounts listed in ADMIN_EMAILS); everyone else gets a 404. */
export default async function AdminOverviewPage() {
  await requireAdminPage("/admin");
  const data = await loadAdminData();
  const blocking = systemStatus().problems.length;
  const ov = data.snapshot && data.accounts ? overview(data.snapshot, data.accounts, data.now) : null;

  return (
    <Page>
      <PageHead {...PAGE_HEADS.admin} />
      <AdminNav />

      {(blocking > 0 || data.problems.length > 0 || ov?.truncated) && (
        <div className="notices">
          {blocking > 0 && (
            <div className="notice error" role="alert">
              <strong>{blocking === 1 ? "1 problem blocks generation." : `${blocking} problems block generation.`}</strong>{" "}
              <Link className="link" href="/admin/system">
                See System
              </Link>
            </div>
          )}
          {data.problems.map((p) => (
            <div className="notice error" key={p} role="alert">
              <strong>{p}</strong>
            </div>
          ))}
          {ov?.truncated && <div className="notice warn">A table was too large to read in full, so the oldest rows are not counted.</div>}
        </div>
      )}

      {ov && (
        <>
          <Figures>
            <Figure
              label="Users"
              value={ov.users.total}
              note={ov.users.newWeek ? `${ov.users.activeWeek} active · ${ov.users.newWeek} new this week` : `${ov.users.activeWeek} active this week`}
            />
            <Figure label="Editions" value={ov.editions.total} note={`${ov.editions.week} this week`} />
            <Figure label="Generations" value={ov.runs.total} note={`${ov.runs.day} in 24 h · ${ov.runs.week} this week`} />
            <Figure
              label="Success rate"
              value={ov.runs.successRate === null ? "—" : Math.round(ov.runs.successRate * 100)}
              unit={ov.runs.successRate === null ? undefined : "%"}
              note={`Last 30 days · ${ov.runs.failedMonth ? `${ov.runs.failedMonth} failed` : "none failed"}`}
            />
            <Figure
              label="Typical time"
              value={typical(ov.runs.medianMs).value}
              unit={typical(ov.runs.medianMs).unit}
              note={ov.runs.medianMs === null ? "Nothing finished in 30 days" : `Median · ${formatDuration(ov.runs.medianMs)}`}
            />
            <Figure label="Opened this week" value={ov.reading.opens} note={`${ov.reading.liked} liked · ${ov.reading.disliked} disliked`} />
          </Figures>

          <section className="section-head" style={{ marginTop: 56 }}>
            <span className="label">Generations per day</span>
            <span className="label muted">Last 30 days · UTC</span>
          </section>
          <DailyChart days={ov.daily} />

          <Section title="Recent generations">
            {ov.recent.length === 0 ? (
              <p className="body muted">None yet.</p>
            ) : (
              <ul className="runs">
                {ov.recent.map((r) => (
                  <li key={r.id}>
                    <span className={`state ${r.status}`}>{r.status.replace("_", " ")}</span>
                    <span className="what" title={r.error}>
                      {r.email ?? "Removed account"} · {formatAgo(r.at, data.now)}
                      {r.status === "failed" && r.error ? ` — ${r.error}` : ""}
                    </span>
                    <span className="meta">{r.durationMs === null ? "" : formatDuration(r.durationMs)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title="Failures" hint="Last 30 days.">
            {ov.failures.length === 0 ? (
              <p className="body muted">None.</p>
            ) : (
              <ul className="reasons">
                {ov.failures.map((f) => (
                  <li key={f.message}>
                    <span className="count">{f.count}×</span>
                    <span className="msg">{f.message}</span>
                    <span className="meta">
                      {plural(f.users, "user")} · last {formatAgo(f.last, data.now)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title="How far people get">
            <div className="bars wide">
              {(
                [
                  ["Signed up", ov.funnel.signedUp],
                  ["Added sources", ov.funnel.addedSources],
                  ["Got an edition", ov.funnel.gotEdition],
                  ["Opened a story", ov.funnel.opened],
                ] as const
              ).map(([label, n]) => (
                <div className="bar" key={label}>
                  <span>{label}</span>
                  <span className="track">
                    <span className="fill" style={{ width: `${ov.funnel.signedUp ? (n / ov.funnel.signedUp) * 100 : 0}%` }} />
                  </span>
                  <span className="val">{n}</span>
                </div>
              ))}
            </div>
            <p className="meta">Opened a story counts the last 30 days.</p>
          </Section>

          <Section title="Limits">
            <dl className="kv">
              <dt>Last 24 hours</dt>
              <dd>
                {ov.runs.day}
                {config.limits.globalDaily ? ` of ${config.limits.globalDaily} allowed for regular accounts` : " · no daily cap"}
              </dd>
              <dt>Per account</dt>
              <dd>{config.limits.userWeekly ? `${config.limits.userWeekly} per rolling week` : "No weekly limit"} · admins have none</dd>
            </dl>
          </Section>
        </>
      )}
    </Page>
  );
}
