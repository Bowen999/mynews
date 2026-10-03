const STEPS = [
  ["1", "Tell it who you are", "Add your homepage, Google Scholar, lab or company pages. An interest profile is built from them."],
  ["2", "Generate on demand", "It searches the previous seven days, clusters duplicates, and scores relevance, impact, novelty, credibility and value."],
  ["3", "Read your edition", "Ten verified stories, each with why it matters, key facts, sources and an expandable analysis."],
];

/**
 * The introduction on the front page, in the classic design (classic.css). Everyone sees it; only the
 * actions change. Shared with the loading skeleton, which passes placeholders for the actions.
 */
export function HomeHero({ actions }: { actions: React.ReactNode }) {
  return (
    <>
      <section className="cl-hero">
        <div className="cl-kicker" style={{ justifyContent: "center" }}>
          Weekly Intelligence Briefing
        </div>
        <h1>Your week, distilled to ten stories.</h1>
        <p>
          Papers, news, funding, events, patents, jobs and WeChat posts from the past seven days, ranked for you and written with every claim
          linked to its source.
        </p>
        <div className="cl-actions">{actions}</div>
      </section>
      <div className="cl-steps" id="how-it-works">
        {STEPS.map(([n, t, d]) => (
          <div className="cl-step" key={n}>
            <div className="cl-n">{n}</div>
            <h3>{t}</h3>
            <p>{d}</p>
          </div>
        ))}
      </div>
    </>
  );
}
