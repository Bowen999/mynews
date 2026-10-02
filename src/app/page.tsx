import Link from "next/link";
import { profileForUser } from "@/lib/accounts";
import { EditionReader } from "@/components/classic/EditionReader";
import { GenerateButton } from "@/components/GenerateButton";
import { configurationAdvisories, configurationProblems } from "@/lib/config";
import { databaseProblem } from "@/lib/pipeline/runner";
import { currentUser } from "@/lib/session";
import { getStore } from "@/lib/store";
import type { AuthUser } from "@/lib/auth";
import { STAGES } from "@/lib/types";
import "./classic.css";

export const dynamic = "force-dynamic";

// The home page keeps the classic card-based design (see classic.css); the rest of the site is editorial.

async function loadDashboard(user: AuthUser) {
  const store = getStore();
  const profile = await profileForUser(user, store);
  const [edition, runs] = await Promise.all([store.getLatestEdition(profile.id), store.listRuns(profile.id, 5)]);
  const unfinished =
    runs.find((r) => r.status !== "completed" && Date.now() - new Date(r.updatedAt).getTime() < 24 * 3600e3 && (!edition || r.createdAt > edition.createdAt)) ?? null;
  const feedback = edition ? Object.fromEntries((await store.feedbackForEdition(edition.id)).map((f) => [f.itemId, f.signal])) : {};
  return { profile, edition, unfinished, feedback };
}

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
      <div className="wrap classic">
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
      </div>
    );
  }

  const problems = configurationProblems().filter((p) => p.key !== "SUPABASE_AUTH");
  let data: Awaited<ReturnType<typeof loadDashboard>> | null = null;
  if (!problems.some((p) => p.key === "SUPABASE")) {
    try {
      data = await loadDashboard(user);
    } catch (e) {
      problems.push(databaseProblem(e));
    }
  }
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

  if (data?.edition) {
    return (
      <div className="wrap classic">
        {notices}
        <EditionReader edition={data.edition} initialFeedback={data.feedback} />
      </div>
    );
  }

  const hasSources = Boolean(data?.profile.sources.length);
  const advisories = user.isAdmin ? configurationAdvisories() : [];
  return (
    <div className="wrap classic">
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
    </div>
  );
}
