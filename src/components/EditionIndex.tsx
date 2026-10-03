import Link from "next/link";
import { categoryLabel } from "@/lib/render/format";
import type { BriefingItem, Edition } from "@/lib/types";
import { formatDay, formatRange } from "@/lib/util/dates";
import { plain, Prose } from "./Prose";

export function dateSpan(item: BriefingItem): string {
  const { earliest, latest } = item.dates;
  if (!earliest) return "";
  if (!latest || earliest.slice(0, 10) === latest.slice(0, 10)) return formatDay(earliest);
  return `${formatDay(earliest)} – ${formatDay(latest)}`;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** An edition as a typographic index: masthead, lead story, numbered list, also-noted links. */
export function EditionIndex({ edition }: { edition: Edition }) {
  const base = `/editions/${edition.id}/stories`;
  const [lead, ...rest] = edition.items;
  const range = formatRange(edition.windowStart, edition.windowEnd);

  return (
    <article>
      <header className="masthead">
        <div className="topline enter">
          <span className="label">
            Weekly Briefing — No. {edition.number} {edition.sample && <span className="sample-flag">Sample data</span>}
          </span>
          <span className="label muted">{range}</span>
        </div>
        <h1 className="display enter" style={{ "--i": 1 } as React.CSSProperties}>
          {edition.headline}
        </h1>
        <div className="grid under enter" style={{ "--i": 2 } as React.CSSProperties}>
          {edition.dek && (
            <p className="dek">
              <Prose text={edition.dek} cite={false} itemHref={(n) => `${base}/${n}`} />
            </p>
          )}
          <dl className="facts">
            <dt>Stories</dt>
            <dd>{edition.items.length}</dd>
            <dt>Scanned</dt>
            <dd>{edition.stats.candidates.toLocaleString()} results</dd>
            <dt>Considered</dt>
            <dd>{edition.stats.clusters} stories</dd>
            <dt>Sources</dt>
            <dd>{edition.stats.providers.join(", ") || "—"}</dd>
          </dl>
        </div>
        {edition.themes.length > 0 && <div className="themes enter">{edition.themes.join("  /  ")}</div>}
      </header>

      {lead && (
        <section className="section-head" aria-label="Top story" style={{ marginTop: 56 }}>
          <span className="label">Top story</span>
        </section>
      )}
      {lead && (
        <div className="lead enter" style={{ "--i": 3 } as React.CSSProperties}>
          <div className="num" aria-hidden>
            {pad(lead.rank)}
          </div>
          <div className="text">
            <span className="label">
              {categoryLabel(lead.category)} <span className="muted">· {[dateSpan(lead), `${lead.sources.length} source${lead.sources.length === 1 ? "" : "s"}`].filter(Boolean).join(" · ")}</span>
            </span>
            <h2 className="title-l">
              <Link href={`${base}/${lead.rank}`}>{lead.title}</Link>
            </h2>
            <p className="body" style={{ fontSize: 17, color: "var(--ink-2)" }}>
              {plain(lead.summary)}
            </p>
            <Link className="read" href={`${base}/${lead.rank}`}>
              Read the brief <span className="arrow">→</span>
            </Link>
          </div>
          <aside className="side">
            {lead.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={lead.imageUrl} alt="" loading="lazy" referrerPolicy="no-referrer" />
            ) : null}
            {lead.keyFacts.length > 0 && (
              <>
                <span className="label muted">Key facts</span>
                <ol className="fact-list">
                  {lead.keyFacts.slice(0, 3).map((f, i) => (
                    <li key={i}>{f.text}</li>
                  ))}
                </ol>
              </>
            )}
          </aside>
        </div>
      )}

      {rest.length > 0 && (
        <>
          <section className="section-head" aria-label="This week">
            <span className="label">This week</span>
            <span className="label muted">
              {pad(2)}–{pad(edition.items.length)}
            </span>
          </section>
          <ol className="index">
            {rest.map((it, i) => (
              <li key={it.id} className="enter" style={{ "--i": i + 4 } as React.CSSProperties}>
                <Link className="row" href={`${base}/${it.rank}`}>
                  <span className="n">{pad(it.rank)}</span>
                  <span className="cat label">{categoryLabel(it.category)}</span>
                  <span className="t">
                    <span className="title-m">{it.title}</span>
                  </span>
                  <span className="m">
                    <span>
                      {[dateSpan(it), `${it.sources.length} source${it.sources.length === 1 ? "" : "s"}`].filter(Boolean).join(" · ")}
                    </span>
                    <span className="go" aria-hidden>
                      →
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        </>
      )}

      {edition.alsoNoted.length > 0 && (
        <>
          <section className="section-head" aria-label="Also noted">
            <span className="label">Also noted</span>
            <span className="label muted">Links only</span>
          </section>
          <ul className="noted">
            {edition.alsoNoted.map((a) => (
              <li key={a.url}>
                <a href={a.url} target="_blank" rel="noopener noreferrer">
                  {a.title}
                </a>
                <small>
                  {categoryLabel(a.category)} · {a.publisher ?? a.domain}
                  {a.publishedAt ? ` · ${formatDay(a.publishedAt)}` : ""}
                </small>
              </li>
            ))}
          </ul>
        </>
      )}

      <footer className="colophon">
        <p>
          Generated {formatDay(edition.createdAt)} from {edition.stats.queries} searches ·{" "}
          {edition.stats.removedClaims
            ? `${edition.stats.removedClaims} unsupported statement${edition.stats.removedClaims === 1 ? "" : "s"} removed`
            : "every statement sourced"}
        </p>
        <div className="links">
          <a className="link" href={`/editions/${edition.id}/standalone`} target="_blank" rel="noopener">
            Open standalone page ↗
          </a>
          <a className="link" href={`/editions/${edition.id}/standalone?download=1`} download>
            Download HTML ↓
          </a>
        </div>
      </footer>
    </article>
  );
}
