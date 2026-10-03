const STEPS = [
  ["1", "Tell it who you are", "Add pages about your work."],
  ["2", "Generate on demand", "It searches the past seven days."],
  ["3", "Read your edition", "Ten verified stories, with sources."],
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
        <p>The past seven days, ranked for you. Every claim sourced.</p>
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
