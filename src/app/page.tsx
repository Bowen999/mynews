import Link from "next/link";
import { profileForUser } from "@/lib/accounts";
import { EditionIndex } from "@/components/EditionIndex";
import { GenerateButton } from "@/components/GenerateButton";
import { configurationProblems } from "@/lib/config";
import { databaseProblem } from "@/lib/pipeline/runner";
import { currentUser } from "@/lib/session";
import { getStore } from "@/lib/store";
import type { AuthUser } from "@/lib/auth";
import { STAGES } from "@/lib/types";

export const dynamic = "force-dynamic";

async function loadDashboard(user: AuthUser) {
  const store = getStore();
  const profile = await profileForUser(user, store);
  const [edition, runs] = await Promise.all([store.getLatestEdition(profile.id), store.listRuns(profile.id, 5)]);
  const unfinished =
    runs.find((r) => r.status !== "completed" && Date.now() - new Date(r.updatedAt).getTime() < 24 * 3600e3 && (!edition || r.createdAt > edition.createdAt)) ?? null;
  return { profile, edition, unfinished };
}

function Landing() {
  return (
    <div className="wrap">
      <section className="hero">
        <div className="label enter">Weekly Intelligence Briefing</div>
        <h1 className="display enter" style={{ marginTop: 24, "--i": 1 } as React.CSSProperties}>
          Your week, distilled to ten stories.
        </h1>
        <p className="dek enter" style={{ "--i": 2 } as React.CSSProperties}>
          Papers, news, funding, events, patents, jobs and WeChat articles from the past seven days, ranked for you and written with every
          claim linked to its source.
        </p>
        <div className="actions enter" style={{ "--i": 3 } as React.CSSProperties}>
          <Link className="btn btn-solid btn-lg" href="/signup">
            Create an account <span className="arrow">→</span>
          </Link>
          <Link className="btn btn-lg" href="/login">
            Sign in
          </Link>
        </div>
      </section>
      <div className="steps">
        {[
          ["01", "Tell it who you are", "Add your homepage, Google Scholar, lab or company pages. An interest profile is built from them."],
          ["02", "Generate on demand", "It searches the previous seven days, groups duplicates, and scores relevance, impact, novelty, credibility and value."],
          ["03", "Read your edition", "Ten verified stories, each with why it matters, key facts, sources and an expandable analysis."],
        ].map(([n, t, d], i) => (
          <div key={n} className="enter" style={{ "--i": i + 4 } as React.CSSProperties}>
            <span className="label muted">{n}</span>
            <h3>{t}</h3>
            <p>{d}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export default async function Home() {
  const user = await currentUser();
  if (!user) return <Landing />;

  const problems = configurationProblems().filter((p) => p.key !== "SUPABASE_AUTH");
  let data: Awaited<ReturnType<typeof loadDashboard>> | null = null;
  if (!problems.some((p) => p.key === "SUPABASE")) {
    try {
      data = await loadDashboard(user);
    } catch (e) {
      problems.push(databaseProblem(e));
    }
  }

  const notices = (problems.length > 0 || data?.unfinished) && (
    <div className="notices">
      {problems.map((p) => (
        <div className="notice error" key={p.key}>
          <strong>{p.message}</strong> {user.isAdmin ? p.action : "The site owner has been notified."}
        </div>
      ))}
      {data?.unfinished && (
        <div className={`notice ${data.unfinished.status === "running" ? "" : "warn"}`}>
          <strong>
            {data.unfinished.status === "running"
              ? "A briefing is being generated."
              : data.unfinished.status === "needs_input"
                ? "Your last generation is waiting for input."
                : "Your last generation stopped early."}
          </strong>{" "}
          Stage: {STAGES.find((s) => s.key === data!.unfinished!.stage)?.label}.{" "}
          <Link className="link" href={`/runs/${data.unfinished.id}`}>
            {data.unfinished.status === "running" ? "Follow progress" : "Resume"}
          </Link>
        </div>
      )}
    </div>
  );

  if (data?.edition) {
    return (
      <div className="wrap">
        {notices}
        <EditionIndex edition={data.edition} />
      </div>
    );
  }

  const hasSources = Boolean(data?.profile.sources.length);
  return (
    <div className="wrap">
      {notices}
      <section className="hero">
        <div className="label">Welcome</div>
        <h1 className="display" style={{ marginTop: 24 }}>
          {hasSources ? "Ready for your first edition." : "Start with the pages that describe you."}
        </h1>
        <p className="dek">
          {hasSources
            ? "Generate your briefing: it searches the past seven days and writes the ten stories that matter most to your work."
            : "Add your homepage, Google Scholar, lab or company pages. They are used to build your interest profile."}
        </p>
        <div className="actions">
          {hasSources ? (
            <GenerateButton size="lg" />
          ) : (
            <Link className="btn btn-solid btn-lg" href="/profile">
              Add your sources <span className="arrow">→</span>
            </Link>
          )}
        </div>
      </section>
    </div>
  );
}
