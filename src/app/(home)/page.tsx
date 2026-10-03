import Link from "next/link";
import { GenerateButton } from "@/components/GenerateButton";
import { HomeHero } from "@/components/HomeHero";
import { Page } from "@/components/PageTransition";
import { configurationAdvisories } from "@/lib/config";
import { loadDashboard } from "@/lib/dashboard";
import { currentUser } from "@/lib/session";
import { STAGES } from "@/lib/types";
import "../classic.css";

export const dynamic = "force-dynamic";

// The front page introduces the app, in the classic Apple News–style design (see classic.css). It shows no
// briefing content itself: editions, the archive and every story use the editorial design, and the
// actions here link into them.

export default async function Home() {
  const user = await currentUser();
  if (!user) {
    return (
      <Page className="wrap classic">
        <HomeHero
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
  const latest = data?.latest;
  const hasSources = Boolean(data?.profile.sources.length);
  const advisories = user.isAdmin && !latest ? configurationAdvisories() : [];

  return (
    <Page className="wrap classic">
      {(problems.length > 0 || unfinished) && (
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
      )}
      <HomeHero
        actions={
          latest ? (
            <>
              <Link href={`/editions/${latest.id}`} className="cl-btn cl-btn-primary cl-btn-lg">
                Read your latest briefing <span aria-hidden>→</span>
              </Link>
              <GenerateButton size="lg" variant="classic-secondary" />
            </>
          ) : hasSources ? (
            <>
              <GenerateButton size="lg" variant="classic" />
              <Link href="/profile" className="cl-btn cl-btn-secondary cl-btn-lg">
                Review profile
              </Link>
            </>
          ) : (
            <>
              <Link href="/profile" className="cl-btn cl-btn-primary cl-btn-lg">
                Add your reference sources
              </Link>
              <a href="#how-it-works" className="cl-btn cl-btn-secondary cl-btn-lg">
                How it works
              </a>
            </>
          )
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
