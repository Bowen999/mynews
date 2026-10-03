import Link from "next/link";
import { GenerateButton } from "@/components/GenerateButton";
import { Page } from "@/components/PageTransition";
import { plain } from "@/components/Prose";
import { configurationAdvisories } from "@/lib/config";
import { loadDashboard } from "@/lib/dashboard";
import { categoryLabel } from "@/lib/render/format";
import { currentUser } from "@/lib/session";
import { CATEGORY_META, STAGES, type Category } from "@/lib/types";
import { formatRange } from "@/lib/util/dates";
import "../classic.css";

export const dynamic = "force-dynamic";

// The home page is the only page in the classic Apple News–style design (see classic.css). Briefings themselves
// (Today, the archive, every story) use the editorial design, so everything here links into those pages.

const tone = (c: Category | undefined) => `cl-tone-${(c && CATEGORY_META[c]?.tone) || "gray"}`;
const pad = (n: number) => String(n).padStart(2, "0");

const STEPS = [
  ["1", "Tell it who you are", "Add your homepage, Google Scholar, lab or company pages. An interest profile is built from them."],
  ["2", "Generate on demand", "It searches the previous seven days, clusters duplicates, and scores relevance, impact, novelty, credibility and value."],
  ["3", "Read your edition", "Ten verified stories, each with why it matters, key facts, sources and an expandable analysis."],
];

function Hero({ actions }: { actions: React.ReactNode }) {
  return (
    <>
      <section className="cl-hero">
        <div className="cl-kicker cl-reveal" style={{ justifyContent: "center" }}>
          Weekly Intelligence Briefing
        </div>
        <h1 className="cl-reveal" style={{ "--i": 1 } as React.CSSProperties}>
          Your week, distilled to ten stories.
        </h1>
        <p className="cl-reveal" style={{ "--i": 2 } as React.CSSProperties}>
          Papers, news, funding, events, patents, jobs and WeChat posts from the past seven days, ranked for you and written with every
          claim linked to its source.
        </p>
        <div className="cl-actions cl-reveal" style={{ "--i": 3 } as React.CSSProperties}>
          {actions}
        </div>
      </section>
      <div className="cl-steps">
        {STEPS.map(([n, t, d], i) => (
          <div className="cl-step cl-reveal" key={n} style={{ "--i": i + 4 } as React.CSSProperties}>
            <div className="cl-n">{n}</div>
            <h3>{t}</h3>
            <p>{d}</p>
          </div>
        ))}
      </div>
    </>
  );
}

export default async function Home() {
  const user = await currentUser();
  if (!user) {
    return (
      <Page className="wrap classic">
        <Hero
          actions={
            <>
              <Link href="/signup" className="cl-btn cl-btn-primary cl-btn-lg">
                Create an account
              </Link>
              <Link href="/login" className="cl-btn cl-btn-secondary cl-btn-lg">
                Sign in
              </Link>
            </>
          }
        />
      </Page>
    );
  }

  const { problems, data } = await loadDashboard(user);
  const unfinished = data?.unfinished;
  const notices = (problems.length > 0 || unfinished) && (
    <div className="cl-notices">
      {problems.map((p) => (
        <div className="cl-notice cl-error" key={p.key}>
          <span className="cl-dot" />
          <div>
            <strong>{p.message}</strong> {user.isAdmin ? p.action : "The site owner has been notified."}
          </div>
        </div>
      ))}
      {unfinished && (
        <div className={`cl-notice ${unfinished.status === "running" ? "" : "cl-warn"}`}>
          <span className="cl-dot" />
          <div>
            <strong>
              {unfinished.status === "running"
                ? "A briefing is being generated."
                : unfinished.status === "needs_input"
                  ? "Your last generation is waiting for input."
                  : "Your last generation stopped early."}
            </strong>{" "}
            {unfinished.status !== "running" && unfinished.error ? `${unfinished.error} ` : ""}
            Stage: {STAGES.find((s) => s.key === unfinished.stage)?.label}.{" "}
            <Link href={`/runs/${unfinished.id}`} style={{ color: "var(--accent)", fontWeight: 600 }}>
              {unfinished.status === "running" ? "Follow progress →" : "Resume →"}
            </Link>
          </div>
        </div>
      )}
    </div>
  );

  const edition = data?.edition;
  if (!edition) {
    const hasSources = Boolean(data?.profile.sources.length);
    const advisories = user.isAdmin ? configurationAdvisories() : [];
    return (
      <Page className="wrap classic">
        {notices}
        <Hero
          actions={
            <>
              {hasSources ? (
                <GenerateButton size="lg" variant="classic" />
              ) : (
                <Link href="/profile" className="cl-btn cl-btn-primary cl-btn-lg">
                  Add your reference sources
                </Link>
              )}
              <Link href="/profile" className="cl-btn cl-btn-secondary cl-btn-lg">
                {hasSources ? "Review profile" : "How it works"}
              </Link>
            </>
          }
        />
        {advisories.length > 0 && (
          <div className="cl-notices" style={{ marginBottom: 80 }}>
            {advisories.map((a) => (
              <div className="cl-notice cl-warn" key={a}>
                <span className="cl-dot" />
                <div>{a}</div>
              </div>
            ))}
          </div>
        )}
      </Page>
    );
  }

  const stories = `/editions/${edition.id}/stories`;
  return (
    <Page className="wrap classic">
      {notices}
      <section className="cl-cover">
        <div className="cl-kicker cl-reveal">
          <span>Your weekly briefing · No. {edition.number}</span>
          <span className="cl-muted">{formatRange(edition.windowStart, edition.windowEnd)}</span>
          {edition.sample && <span className="cl-sample-badge">Sample data</span>}
        </div>
        <h1 className="cl-reveal" style={{ "--i": 1 } as React.CSSProperties}>
          {edition.headline}
        </h1>
        {edition.dek && (
          <p className="cl-dek cl-reveal" style={{ "--i": 2 } as React.CSSProperties}>
            {plain(edition.dek).replace(/\s*\[\d+\]/g, "")}
          </p>
        )}
        {edition.themes.length > 0 && (
          <div className="cl-chips cl-reveal" style={{ "--i": 3 } as React.CSSProperties}>
            {edition.themes.map((t) => (
              <span className="cl-chip" key={t}>
                {t}
              </span>
            ))}
          </div>
        )}
        <div className="cl-actions cl-reveal" style={{ "--i": 4 } as React.CSSProperties}>
          <Link href="/today" className="cl-btn cl-btn-primary cl-btn-lg">
            Read this week&apos;s briefing <span className="cl-arrow">→</span>
          </Link>
          <GenerateButton size="lg" variant="classic-secondary" />
        </div>
      </section>

      <div className="cl-section-head">
        <h2>In this edition</h2>
        <p>
          {edition.items.length} stories, ranked for you · {edition.stats.candidates.toLocaleString()} results scanned
        </p>
      </div>
      <nav className="cl-contents cl-reveal" aria-label="Stories in this edition">
        <ol>
          {edition.items.map((it) => (
            <li key={it.id} className={tone(it.category)}>
              <Link href={`${stories}/${it.rank}`}>
                <span>
                  <small>{categoryLabel(it.category)}</small>
                  <span className="cl-t">{it.title}</span>
                </span>
              </Link>
            </li>
          ))}
        </ol>
      </nav>

      {data.earlier.length > 0 && (
        <>
          <div className="cl-section-head">
            <h2>Earlier editions</h2>
            <p>
              <Link href="/editions" style={{ color: "var(--accent)", fontWeight: 600 }}>
                All editions →
              </Link>
            </p>
          </div>
          <div className="cl-story-grid">
            {data.earlier.map((e, i) => (
              <Link key={e.id} href={`/editions/${e.id}`} className={`cl-card cl-typo cl-reveal ${tone(e.topCategories[0])}`} style={{ "--i": i } as React.CSSProperties}>
                <div className="cl-media" aria-hidden>
                  <span className="cl-big">{pad(e.number)}</span>
                </div>
                <div className="cl-body">
                  <div className="cl-eyebrow">
                    <span>{formatRange(e.windowStart, e.windowEnd)}</span>
                  </div>
                  <h3>{e.headline}</h3>
                  <div className="cl-foot">
                    <span>{e.itemCount} stories</span>
                    {e.topCategories.length > 0 && <span>· {e.topCategories.slice(0, 3).map((c) => CATEGORY_META[c]?.short ?? c).join(" / ")}</span>}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </>
      )}
      <div style={{ height: 24 }} />
    </Page>
  );
}
