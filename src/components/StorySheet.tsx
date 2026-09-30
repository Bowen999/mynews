"use client";

import { useEffect, useRef, useState } from "react";
import { categoryLabel, dateNote, scoreRows, sourceNumber } from "@/lib/render/format";
import { CATEGORY_META, type BriefingItem } from "@/lib/types";
import { formatDay } from "@/lib/util/dates";
import { CloseIcon, ExternalIcon, ThumbDownIcon, ThumbUpIcon } from "./Icons";
import { Prose } from "./Prose";

interface Props {
  item: BriefingItem | null;
  total: number;
  feedback: Record<string, 1 | -1>;
  onFeedback: (itemId: string, signal: 1 | -1 | 0) => void;
  onClose: () => void;
  onNavigate: (rank: number) => void;
}

export function dateSpan(item: BriefingItem): string {
  const { earliest, latest } = item.dates;
  if (!earliest) return "";
  if (!latest || earliest.slice(0, 10) === latest.slice(0, 10)) return formatDay(earliest);
  return `${formatDay(earliest)} – ${formatDay(latest)}`;
}

export function StorySheet({ item, total, feedback, onFeedback, onClose, onNavigate }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [openAnalysis, setOpenAnalysis] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (item && !d.open) {
      // Focus the scroll container (not the close button) so opening never scrolls the sheet.
      panel.current?.setAttribute("autofocus", "");
      d.showModal();
    }
    if (!item && d.open) d.close();
  }, [item]);

  useEffect(() => {
    // Reset per-story UI state when navigating between stories.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOpenAnalysis(false);
    setFlash(null);
    panel.current?.scrollTo({ top: 0 });
  }, [item?.id]);

  useEffect(() => {
    if (!item) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && ["INPUT", "TEXTAREA"].includes(e.target.tagName)) return;
      if (e.key === "ArrowRight" && item.rank < total) onNavigate(item.rank + 1);
      if (e.key === "ArrowLeft" && item.rank > 1) onNavigate(item.rank - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [item, total, onNavigate]);

  const cite = (id: string) => {
    const el = panel.current?.querySelector(`[data-source="${id}"]`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    setFlash(id);
    window.setTimeout(() => setFlash((f) => (f === id ? null : f)), 1800);
  };

  const tone = item ? (CATEGORY_META[item.category]?.tone ?? "gray") : "gray";
  const signal = item ? feedback[item.id] : undefined;

  return (
    <dialog
      ref={dialog}
      className={`sheet tone-${tone}`}
      onClose={onClose}
      onClick={(e) => e.target === dialog.current && dialog.current?.close()}
      aria-labelledby="story-title"
    >
      {item && (
        <div className="sheet-panel" ref={panel} tabIndex={-1}>
          <button type="button" className="icon-btn sheet-close" onClick={() => dialog.current?.close()} aria-label="Close story">
            <CloseIcon />
          </button>
          <article className="story-full">
            <div className="eyebrow">
              <span className="rank">{String(item.rank).padStart(2, "0")}</span>
              <span>{categoryLabel(item.category)}</span>
              {item.confidence !== "high" && (
                <>
                  <span className="sep" />
                  <span className="aside">{item.confidence} confidence</span>
                </>
              )}
            </div>
            <h2 id="story-title">{item.title}</h2>
            <div className="story-meta">
              {dateSpan(item) && <span>Published {dateSpan(item)}</span>}
              <span>
                {item.sources.length} source{item.sources.length === 1 ? "" : "s"}
              </span>
              <span>Score {Math.round(item.relevance.total)}/100</span>
            </div>

            {item.whyItMatters && (
              <div className="why-callout">
                <span className="label">Why it matters to you</span>
                <p>
                  <Prose text={item.whyItMatters} onCite={cite} />
                </p>
              </div>
            )}

            <p className="lede">
              <Prose text={item.summary} onCite={cite} />
            </p>

            {item.keyFacts.length > 0 && (
              <>
                <h3 className="block-title">Key facts</h3>
                <ol className="facts">
                  {item.keyFacts.map((f, i) => (
                    <li key={i}>
                      {f.text}
                      {f.sources.map((s) => (
                        <sup className="cite" key={s}>
                          <button type="button" onClick={() => cite(s)} aria-label={`Source ${sourceNumber(s)}`}>
                            {sourceNumber(s)}
                          </button>
                        </sup>
                      ))}
                    </li>
                  ))}
                </ol>
              </>
            )}

            <h3 className="block-title">Why it ranks here</h3>
            <div className="rank-panel">
              <div className="total-score" style={{ "--p": Math.round(item.relevance.total) } as React.CSSProperties}>
                <span>{Math.round(item.relevance.total)}</span>
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
              {item.relevance.explanation && (
                <p className="rank-notes">
                  <Prose text={item.relevance.explanation} onCite={cite} />
                </p>
              )}
              {item.relevance.adjustments.length > 0 && (
                <div className="adjustments">
                  {item.relevance.adjustments.map((a) => (
                    <span key={a}>{a}</span>
                  ))}
                </div>
              )}
            </div>

            {item.analysis.length > 0 && (
              <section className="analysis" data-open={openAnalysis}>
                <button type="button" className="analysis-toggle" aria-expanded={openAnalysis} onClick={() => setOpenAnalysis((o) => !o)}>
                  Detailed analysis
                  <span className="plus" aria-hidden>
                    +
                  </span>
                </button>
                <div className="analysis-body" aria-hidden={!openAnalysis}>
                  <div>
                    {item.analysis.map((a, i) => (
                      <div key={i}>
                        {a.heading && <h4>{a.heading}</h4>}
                        <p>
                          <Prose text={a.body} onCite={cite} />
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            )}

            <h3 className="block-title">Sources</h3>
            <ol className="source-list">
              {item.sources.map((s) => (
                <li key={s.id} data-source={s.id} className={`source ${flash === s.id ? "flash" : ""}`}>
                  <span className="num">{sourceNumber(s.id)}</span>
                  <div>
                    <a className="title" href={s.url} target="_blank" rel="noopener noreferrer">
                      {s.title}
                    </a>
                    <span className="meta">
                      {s.publisher ?? s.domain}
                      {s.publisher && s.publisher !== s.domain ? ` · ${s.domain}` : ""}
                      {" · "}
                      <span title={dateNote(s.dateSource)}>{s.publishedAt ? formatDay(s.publishedAt) : "date not stated"}</span>
                      {s.dateSource === "provider" || s.dateSource === "unknown" ? " ·" : ""}
                      {s.dateSource === "provider" && " date per search index"}
                      {s.dateSource === "unknown" && " date unverified"}
                    </span>
                  </div>
                  <a className="ext" href={s.url} target="_blank" rel="noopener noreferrer" aria-label="Open source">
                    <ExternalIcon />
                  </a>
                </li>
              ))}
            </ol>

            <details className="verification">
              <summary>
                Verification: {item.verification.checkedClaims} statements checked
                {item.verification.removedClaims ? `, ${item.verification.removedClaims} removed as unsupported` : ", all matched to sources"}
              </summary>
              <ul>
                <li>Every citation links to one of the sources above; source links come from search results, never from the model.</li>
                <li>Numbers in generated text must appear in the cited source, otherwise the sentence is removed.</li>
                {item.verification.notes.map((n, i) => (
                  <li key={i}>{n}</li>
                ))}
              </ul>
            </details>

            <div className="feedback">
              <span>Tune future briefings</span>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                aria-pressed={signal === 1}
                onClick={() => onFeedback(item.id, signal === 1 ? 0 : 1)}
              >
                <ThumbUpIcon /> More like this
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                aria-pressed={signal === -1}
                onClick={() => onFeedback(item.id, signal === -1 ? 0 : -1)}
              >
                <ThumbDownIcon /> Less like this
              </button>
              <span className="spacer" />
              <button type="button" className="btn btn-ghost btn-sm" disabled={item.rank <= 1} onClick={() => onNavigate(item.rank - 1)}>
                ← Previous
              </button>
              <button type="button" className="btn btn-ghost btn-sm" disabled={item.rank >= total} onClick={() => onNavigate(item.rank + 1)}>
                Next →
              </button>
            </div>
          </article>
        </div>
      )}
    </dialog>
  );
}
