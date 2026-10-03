import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminNav } from "@/components/AdminNav";
import { Figure, Figures, Section, Tag } from "@/components/AdminParts";
import { Page } from "@/components/PageTransition";
import { loadAdminData, userDetail } from "@/lib/admin";
import { providerLabel } from "@/lib/auth/providers";
import { config } from "@/lib/config";
import { requireAdminPage } from "@/lib/session";
import { STAGES } from "@/lib/types";
import { formatAgo, formatDate, formatDuration } from "@/lib/util/dates";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Admin · User" };

/** One account's usage, as counts and times. Briefings, sources and ratings stay private. Admins only. */
export default async function AdminUserPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireAdminPage(`/admin/users/${encodeURIComponent(id)}`);
  const { snapshot, accounts, problems, now } = await loadAdminData();
  const detail = snapshot && accounts ? userDetail(id, snapshot, accounts, now, config.limits.userWeekly) : null;
  if (snapshot && accounts && !detail) notFound();

  return (
    <Page>
      <header className="page-head">
        <div className="label">
          <Link className="back" href="/admin/users">
            ← Users
          </Link>
        </div>
        <h1 className="title-l user-title">
          {detail?.user.email ?? "User"}
          {detail?.user.isAdmin && <Tag>Admin</Tag>}
        </h1>
      </header>
      <AdminNav />

      {problems.length > 0 && (
        <div className="notices">
          {problems.map((p) => (
            <div className="notice error" key={p} role="alert">
              <strong>{p}</strong>
            </div>
          ))}
        </div>
      )}

      {detail && (
        <>
          <Figures cols={4}>
            <Figure
              label="Editions"
              value={detail.user.editions}
              note={detail.user.lastRunAt ? `Last generation ${formatAgo(detail.user.lastRunAt, now)}` : "Never generated"}
            />
            <Figure
              label="Generations"
              value={detail.user.runs}
              note={`${detail.user.runsWeek}${detail.quota.limit ? ` of ${detail.quota.limit}` : ""} this week`}
            />
            <Figure label="Failed" value={detail.user.failedMonth} note="Last 30 days" />
            <Figure label="Opened" value={detail.user.opens} note={`${detail.user.liked} liked · ${detail.user.disliked} disliked · 30 days`} />
          </Figures>

          <Section title="Account">
            <dl className="kv">
              <dt>Email</dt>
              <dd>
                {detail.user.email}
                {detail.user.confirmed ? "" : " · not confirmed"}
              </dd>
              <dt>User ID</dt>
              <dd>
                <code>{detail.user.id}</code>
              </dd>
              <dt>Role</dt>
              <dd>{detail.user.isAdmin ? "Admin" : "Regular"}</dd>
              <dt>Sign-in methods</dt>
              <dd>{detail.user.providers.map(providerLabel).join(" · ")}</dd>
              <dt>Joined</dt>
              <dd>{[formatDate(detail.user.createdAt), formatAgo(detail.user.createdAt, now)].filter((t, i, all) => all.indexOf(t) === i).join(" · ")}</dd>
              <dt>Last sign-in</dt>
              <dd>{detail.user.lastSignInAt ? formatAgo(detail.user.lastSignInAt, now) : "Not recorded"}</dd>
              <dt>Last active</dt>
              <dd>{detail.user.lastActiveAt ? formatAgo(detail.user.lastActiveAt, now) : "Never"}</dd>
            </dl>
          </Section>

          <Section title="Profile">
            {detail.user.hasProfile ? (
              <dl className="kv">
                <dt>Reference sources</dt>
                <dd>{detail.user.sources}</dd>
                <dt>Interest profile</dt>
                <dd>{detail.user.interest ? "Built" : "Not built yet"}</dd>
                <dt>Notifications</dt>
                <dd>{detail.user.ntfy ? "On" : "Off"}</dd>
              </dl>
            ) : (
              <p className="body muted">No profile yet. It is created when this account first opens the app.</p>
            )}
          </Section>

          <Section title="Generations" hint="The latest 20.">
            {detail.runs.length === 0 ? (
              <p className="body muted">None yet.</p>
            ) : (
              <ul className="runs">
                {detail.runs.map((r) => (
                  <li key={r.id}>
                    <span className={`state ${r.status}`}>{r.status.replace("_", " ")}</span>
                    <span className="what" title={r.error}>
                      {formatDate(r.at)}
                      {r.status !== "completed" && ` · ${STAGES.find((s) => s.key === r.stage)?.label}`}
                      {r.error ? ` — ${r.error}` : ""}
                    </span>
                    <span className="meta">{r.durationMs === null ? "" : formatDuration(r.durationMs)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title="Editions" hint="The latest 20.">
            {detail.editions.length === 0 ? (
              <p className="body muted">None.</p>
            ) : (
              <ul className="runs editions-list">
                {detail.editions.map((e) => (
                  <li key={e.number}>
                    <span className="state">No. {String(e.number).padStart(2, "0")}</span>
                    <span className="what">
                      {formatDate(e.createdAt)}
                      {e.sample ? " · sample data" : ""}
                    </span>
                    <span />
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </>
      )}
    </Page>
  );
}
