import type { Metadata } from "next";
import { AdminNav } from "@/components/AdminNav";
import { Section } from "@/components/AdminParts";
import { PAGE_HEADS, PageHead } from "@/components/PageHead";
import { Page } from "@/components/PageTransition";
import { enabledOAuthProviders } from "@/lib/auth/oauth";
import { providerLabel } from "@/lib/auth/providers";
import { config, deploymentEnvironment, hasSupabaseAuth, keyDiagnostics } from "@/lib/config";
import { requireAdminPage } from "@/lib/session";
import { systemStatus } from "@/lib/status";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Admin · System" };

/** Keys, services and what needs fixing. Admins only (accounts listed in ADMIN_EMAILS); everyone else gets a 404. */
export default async function AdminSystemPage() {
  await requireAdminPage("/admin/system");
  const status = systemStatus();
  const keys = keyDiagnostics();
  const oauth = await enabledOAuthProviders();
  const commit = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7);

  return (
    <Page>
      <PageHead {...PAGE_HEADS.admin} />
      <AdminNav />

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
