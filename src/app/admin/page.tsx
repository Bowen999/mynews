import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PAGE_HEADS, PageHead } from "@/components/PageHead";
import { Page } from "@/components/PageTransition";
import { enabledOAuthProviders } from "@/lib/auth/oauth";
import { providerLabel } from "@/lib/auth/providers";
import { config, deploymentEnvironment, hasSupabaseAuth, keyDiagnostics } from "@/lib/config";
import { requirePageUser } from "@/lib/session";
import { systemStatus } from "@/lib/status";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Admin" };

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="form-section">
      <header>
        <h2>{title}</h2>
        {hint && <p>{hint}</p>}
      </header>
      <div className="fields">{children}</div>
    </section>
  );
}

async function usage(): Promise<{ day: number; week: number } | null> {
  try {
    const store = getStore();
    const now = Date.now();
    const [day, week] = await Promise.all([
      store.countRunsSince(new Date(now - 86400e3).toISOString()),
      store.countRunsSince(new Date(now - 7 * 86400e3).toISOString()),
    ]);
    return { day, week };
  } catch {
    return null;
  }
}

/** System status for admins (accounts listed in ADMIN_EMAILS). Everyone else gets a 404. */
export default async function AdminPage() {
  const user = await requirePageUser("/admin");
  if (!user.isAdmin) notFound();
  const status = systemStatus();
  const keys = keyDiagnostics();
  const [runs, oauth] = await Promise.all([usage(), enabledOAuthProviders()]);
  const commit = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7);

  return (
    <Page>
      <PageHead {...PAGE_HEADS.admin} />

      <Section title="Needs attention" hint="Problems block generation; advisories limit quality.">
        {status.problems.length === 0 && status.advisories.length === 0 ? (
          <p className="body muted">Nothing to fix.</p>
        ) : (
          <div className="notices" style={{ marginTop: 0 }}>
            {status.problems.map((p) => (
              <div className="notice error" key={p.key}>
                <strong>{p.message}</strong> {p.action}
              </div>
            ))}
            {status.advisories.map((a) => (
              <div className="notice warn" key={a}>
                {a}
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section
        title="Keys"
        hint="Values are never shown. Redeploy after changing one."
      >
        <dl className="kv keys">
          <dt>Environment</dt>
          <dd>
            {config.onVercel ? `Vercel · ${deploymentEnvironment()}` : "Local"}
            {commit ? ` · commit ${commit}` : ""}
            {config.mockMode ? " · MOCK_MODE on" : ""}
          </dd>
          {keys.map((k) => (
            <KeyRow key={k.name} name={k.name} set={k.set} required={k.required} purpose={k.purpose} note={k.note} />
          ))}
        </dl>
      </Section>

      <Section title="Services">
        <dl className="kv">
          <dt>Language model</dt>
          <dd>{status.llm}</dd>
          <dt>Web search</dt>
          <dd>{status.search.length ? status.search.join(", ") : "Free RSS fallback only"}</dd>
          <dt>Scholarly</dt>
          <dd>{status.scholarly.join(", ")}</dd>
          <dt>Embeddings</dt>
          <dd>{status.embeddings}</dd>
          <dt>Storage</dt>
          <dd>{status.storage === "supabase" ? "Supabase" : "Local files (development)"}</dd>
          <dt>Sign-in</dt>
          <dd>
            {hasSupabaseAuth()
              ? ["email", ...oauth].map(providerLabel).join(" · ") + (oauth.length ? "" : " (GitHub and Google: enable in Supabase Auth)")
              : "Local development accounts (email only)"}
          </dd>
          <dt>Owner notifications</dt>
          <dd>{status.ntfyTopic}</dd>
        </dl>
      </Section>

      <Section title="Usage" hint="Generations across all accounts. Admins have no limit.">
        <dl className="kv">
          <dt>Last 24 hours</dt>
          <dd>
            {runs ? runs.day : "—"}
            {config.limits.globalDaily ? ` of ${config.limits.globalDaily} allowed for regular accounts` : " · no daily cap"}
          </dd>
          <dt>Last 7 days</dt>
          <dd>{runs ? runs.week : "—"}</dd>
          <dt>Per account</dt>
          <dd>{config.limits.userWeekly ? `${config.limits.userWeekly} per rolling week` : "No weekly limit"}</dd>
        </dl>
        <p className="body muted" style={{ fontSize: 15 }}>
          Your own settings are on the <Link className="link" href="/profile">Profile</Link> page.
        </p>
      </Section>
    </Page>
  );
}

function KeyRow({ name, set, required, purpose, note }: { name: string; set: boolean; required: boolean; purpose: string; note?: string }) {
  return (
    <>
      <dt>
        <code>{name}</code>
      </dt>
      <dd className={!set && required ? "form-error" : undefined}>
        {set ? "Set" : required ? "Missing (required)" : "Not set"} · {purpose}
        {note ? ` · ${note}` : ""}
      </dd>
    </>
  );
}
