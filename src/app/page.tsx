import Link from "next/link";
import { EditionReader } from "@/components/EditionReader";
import { GenerateButton } from "@/components/GenerateButton";
import { configurationAdvisories, configurationProblems } from "@/lib/config";
import { databaseProblem } from "@/lib/pipeline/runner";
import { getStore, loadProfile } from "@/lib/store";
import { STAGES } from "@/lib/types";

export const dynamic = "force-dynamic";

async function load() {
  const problems = configurationProblems();
  const empty = { profile: null, edition: null, unfinished: null, feedback: {} };
  if (problems.some((p) => p.key === "SUPABASE")) return { problems, ...empty };
  try {
    return { problems, ...(await loadData()) };
  } catch (e) {
    return { problems: [...problems, databaseProblem(e)], ...empty };
  }
}

async function loadData() {
  const store = getStore();
  const profile = await loadProfile(store);
  const [edition, runs] = await Promise.all([store.getLatestEdition(profile.id), store.listRuns(profile.id, 5)]);
  const unfinished = runs.find((r) => r.status !== "completed" && Date.now() - new Date(r.updatedAt).getTime() < 24 * 3600e3 && (!edition || r.createdAt > edition.createdAt)) ?? null;
  const feedback = edition ? Object.fromEntries((await store.feedbackForEdition(edition.id)).map((f) => [f.itemId, f.signal])) : {};
  return { profile, edition, unfinished, feedback };
}

export default async function Home() {
  const { problems, profile, edition, unfinished, feedback } = await load();
  const advisories = configurationAdvisories();

  const banners = (
    <>
      {(problems.length > 0 || unfinished) && (
        <div className="notices">
          {problems.map((p) => (
            <div className="notice error" key={p.key}>
              <span className="dot" />
              <div>
                <strong>{p.message}</strong> {p.action}
              </div>
            </div>
          ))}
          {unfinished && (
            <div className={`notice ${unfinished.status === "running" ? "" : "warn"}`}>
              <span className="dot" />
              <div>
                <strong>
                  {unfinished.status === "running"
                    ? "A briefing is being generated."
                    : unfinished.status === "needs_input"
                      ? "The last generation is waiting for your input."
                      : "The last generation stopped early."}
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
      )}
    </>
  );

  if (edition) {
    return (
      <div className="container">
        {banners}
        <EditionReader edition={edition} initialFeedback={feedback} />
      </div>
    );
  }

  const hasSources = Boolean(profile?.sources.length);
  return (
    <div className="container">
      {banners}
      <section className="hero">
        <div className="kicker reveal" style={{ justifyContent: "center" }}>
          Weekly Intelligence Briefing
        </div>
        <h1 className="reveal" style={{ "--i": 1 } as React.CSSProperties}>
          Your week, distilled to ten stories.
        </h1>
        <p className="reveal" style={{ "--i": 2 } as React.CSSProperties}>
          Papers, news, funding, events, patents, jobs and WeChat posts from the past seven days, ranked for you and written with every
          claim linked to its source.
        </p>
        <div className="actions reveal" style={{ "--i": 3 } as React.CSSProperties}>
          {hasSources ? (
            <GenerateButton size="lg" />
          ) : (
            <Link href="/profile" className="btn btn-primary btn-lg">
              Add your reference sources
            </Link>
          )}
          <Link href="/profile" className="btn btn-secondary btn-lg">
            {hasSources ? "Review profile" : "How it works"}
          </Link>
        </div>
      </section>
      <div className="steps">
        {[
          ["1", "Tell it who you are", "Add your homepage, Google Scholar, lab or company pages. An interest profile is built from them."],
          ["2", "Generate on demand", "It searches the previous seven days, clusters duplicates, and scores relevance, impact, novelty, credibility and value."],
          ["3", "Read your edition", "Ten verified stories, each with why it matters, key facts, sources and an expandable analysis."],
        ].map(([n, t, d], i) => (
          <div className="step reveal" key={n} style={{ "--i": i + 4 } as React.CSSProperties}>
            <div className="n">{n}</div>
            <h3>{t}</h3>
            <p>{d}</p>
          </div>
        ))}
      </div>
      {advisories.length > 0 && (
        <div className="notices" style={{ marginBottom: 80 }}>
          {advisories.map((a) => (
            <div className="notice warn" key={a}>
              <span className="dot" />
              <div>{a}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
