import Link from "next/link";
import { categoryLabel, dateNote, scoreRows, sourceNumber } from "@/lib/render/format";
import type { BriefingItem, Edition } from "@/lib/types";
import { formatDay } from "@/lib/util/dates";
import { dateSpan } from "./EditionIndex";
import { Prose } from "./Prose";
import { Analysis, FeedbackButtons } from "./StoryClient";

const pad = (n: number) => String(n).padStart(2, "0");

/** One briefing item as a full article page. */
export function StoryArticle({ edition, item, feedback }: { edition: Edition; item: BriefingItem; feedback?: 1 | -1 }) {
  const prev = edition.items.find((i) => i.rank === item.rank - 1);
  const next = edition.items.find((i) => i.rank === item.rank + 1);
  const base = `/editions/${edition.id}`;

  return (
    <article>
      <header className="article-head">
        <nav className="crumbs label" aria-label="Breadcrumb">
          <Link href={base}>Weekly Briefing No. {edition.number}</Link>
          <span className="muted">/</span>
          <span>
            {pad(item.rank)} {categoryLabel(item.category)}
          </span>
        </nav>
        <h1 className="title-xl enter">{item.title}</h1>
        <div className="byline">
          {dateSpan(item) && (
            <span>
              Published <b>{dateSpan(item)}</b>
            </span>
          )}
          <span>
            <b>{item.sources.length}</b> source{item.sources.length === 1 ? "" : "s"}
          </span>
          <span>
            Score <b>{Math.round(item.relevance.total)}</b>/100
          </span>
          {item.confidence !== "high" && <span>{item.confidence[0].toUpperCase() + item.confidence.slice(1)} confidence</span>}
        </div>
      </header>

      {item.whyItMatters && (
        <section className="block">
          <h2 className="label">Why it matters to you</h2>
          <div className="content">
            <p className="why-text">
              <Prose text={item.whyItMatters} />
            </p>
          </div>
        </section>
      )}

      <section className="block">
        <h2 className="label">Summary</h2>
        <div className="content">
          <p className="body">
            <Prose text={item.summary} />
          </p>
        </div>
      </section>

      {item.keyFacts.length > 0 && (
        <section className="block">
          <h2 className="label">Key facts</h2>
          <div className="content">
            <ol className="facts-list">
              {item.keyFacts.map((f, i) => (
                <li key={i}>
                  <span>
                    {f.text}
                    {f.sources.map((s) => (
                      <sup className="cite" key={s}>
                        <a href={`#source-${sourceNumber(s)}`}>{sourceNumber(s)}</a>
                      </sup>
                    ))}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </section>
      )}

      <section className="block">
        <h2 className="label">Why it ranks here</h2>
        <div className="content score">
          <div className="big">
            {Math.round(item.relevance.total)}
            <small>of 100</small>
          </div>
          <div className="bars">
            {scoreRows(item.relevance.scores).map((r) => (
              <div className="bar" key={r.key}>
                <span>{r.label}</span>
                <div className="track">
                  <div className="fill" style={{ width: `${r.value * 10}%` }} />
                </div>
                <span className="val">{r.value.toFixed(1)}</span>
              </div>
            ))}
          </div>
          <div className="score-notes">
            {item.relevance.explanation && (
              <p className="body" style={{ fontSize: 17, color: "var(--ink-2)" }}>
                <Prose text={item.relevance.explanation} />
              </p>
            )}
            {item.relevance.adjustments.length > 0 && (
              <ul className="adjustments">
                {item.relevance.adjustments.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>

      {item.analysis.length > 0 && (
        <section className="block">
          <h2 className="label">Analysis</h2>
          <div className="content">
            <Analysis>
              {item.analysis.map((a, i) => (
                <div key={i}>
                  {a.heading && <h3>{a.heading}</h3>}
                  <p className="body">
                    <Prose text={a.body} />
                  </p>
                </div>
              ))}
            </Analysis>
          </div>
        </section>
      )}

      <section className="block">
        <h2 className="label">Sources</h2>
        <div className="content">
          <ol className="sources">
            {item.sources.map((s) => (
              <li key={s.id} id={`source-${sourceNumber(s.id)}`}>
                <span className="sn">{pad(Number(sourceNumber(s.id)))}</span>
                <div>
                  <a className="t" href={s.url} target="_blank" rel="noopener noreferrer">
                    {s.title} ↗
                  </a>
                  <span className="src-meta">
                    {s.publisher ?? s.domain}
                    {s.publisher && s.publisher !== s.domain ? ` · ${s.domain}` : ""} ·{" "}
                    <span title={dateNote(s.dateSource)}>{s.publishedAt ? formatDay(s.publishedAt) : "date not stated"}</span>
                    {s.dateSource === "provider" && " · date per search index"}
                    {s.dateSource === "unknown" && " · date unverified"}
                  </span>
                </div>
              </li>
            ))}
          </ol>
          <details className="verification">
            <summary>
              Verification: {item.verification.checkedClaims} statements checked
              {item.verification.removedClaims ? `, ${item.verification.removedClaims} removed as unsupported` : ", all matched to sources"}
            </summary>
            <ul>
              <li>Source links come from search results, never from the model.</li>
              <li>Numbers in generated text must appear in the cited source; otherwise the sentence is removed.</li>
              {item.verification.notes.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          </details>
        </div>
      </section>

      <section className="block" style={{ borderBottom: 0 }}>
        <h2 className="label">Tune future briefings</h2>
        <div className="content">
          <FeedbackButtons editionId={edition.id} itemId={item.id} initial={feedback} />
        </div>
      </section>

      <nav className="pager" aria-label="More stories">
        {prev ? (
          <Link href={`${base}/stories/${prev.rank}`}>
            <span className="label muted">← Previous · {pad(prev.rank)}</span>
            <span className="title-m">{prev.title}</span>
          </Link>
        ) : (
          <Link href={base}>
            <span className="label muted">← Edition</span>
            <span className="title-m">Back to No. {edition.number}</span>
          </Link>
        )}
        {next ? (
          <Link href={`${base}/stories/${next.rank}`}>
            <span className="label muted">Next · {pad(next.rank)} →</span>
            <span className="title-m">{next.title}</span>
          </Link>
        ) : (
          <Link href={base}>
            <span className="label muted">Edition →</span>
            <span className="title-m">Back to No. {edition.number}</span>
          </Link>
        )}
      </nav>
    </article>
  );
}
