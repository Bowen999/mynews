"use client";

import { useEffect, useRef, useState } from "react";
import { categoryLabel, dateNote, scoreRows, sourceNumber } from "@/lib/render/format";
import { CATEGORY_META, type BriefingItem } from "@/lib/types";
import { formatDay } from "@/lib/util/dates";
import { CloseIcon, ExternalIcon, ThumbDownIcon, ThumbUpIcon } from "../Icons";
import { trackInteraction } from "../StoryClient";
import { ClassicProse as Prose } from "./Prose";

interface Props {
  editionId: string;
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

/** Full story in a modal sheet over the classic front page. */
export function StorySheet({ editionId, item, total, feedback, onFeedback, onClose, onNavigate }: Props) {
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

  // Implicit feedback: a story counts as read when its sheet stays open briefly.
  useEffect(() => {
    if (!item) return;
    const t = setTimeout(() => trackInteraction(editionId, item.id, "open"), 1500);
    return () => clearTimeout(t);
  }, [editionId, item]);

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

  const followed = () => item && trackInteraction(editionId, item.id, "source");
  const tone = item ? (CATEGORY_META[item.category]?.tone ?? "gray") : "gray";
  const signal = item ? feedback[item.id] : undefined;

  return (
    <dialog
      ref={dialog}
      className={`cl-sheet cl-tone-${tone}`}
      onClose={onClose}
      onClick={(e) => e.target === dialog.current && dialog.current?.close()}
      aria-labelledby="story-title"
    >
      {item && (
        <div className="cl-sheet-panel" ref={panel} tabIndex={-1}>
          <button type="button" className="cl-icon-btn cl-sheet-close" onClick={() => dialog.current?.close()} aria-label="Close story">
            <CloseIcon />
          </button>
          <article className="cl-story-full">
            <div className="cl-eyebrow">
              <span className="cl-rank">{String(item.rank).padStart(2, "0")}</span>
              <span>{categoryLabel(item.category)}</span>
              {item.confidence !== "high" && (
                <>
                  <span className="cl-sep" />
                  <span className="cl-aside">{item.confidence} confidence</span>
                </>
              )}
            </div>
            <h2 id="story-title">{item.title}</h2>
            <div className="cl-story-meta">
              {dateSpan(item) && <span>Published {dateSpan(item)}</span>}
              <span>
                {item.sources.length} source{item.sources.length === 1 ? "" : "s"}
              </span>
              <span>Score {Math.round(item.relevance.total)}/100</span>
            </div>

            {item.whyItMatters && (
              <div className="cl-why-callout">
                <span className="cl-label">Why it matters to you</span>
                <p>
                  <Prose text={item.whyItMatters} onCite={cite} />
                </p>
              </div>
            )}

            <p className="cl-lede">
              <Prose text={item.summary} onCite={cite} />
            </p>

            {item.keyFacts.length > 0 && (
              <>
                <h3 className="cl-block-title">Key facts</h3>
                <ol className="cl-facts">
                  {item.keyFacts.map((f, i) => (
                    <li key={i}>
                      {f.text}
                      {f.sources.map((s) => (
                        <sup className="cl-cite" key={s}>
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

            <h3 className="cl-block-title">Why it ranks here</h3>
            <div className="cl-rank-panel">
              <div className="cl-total-score" style={{ "--p": Math.round(item.relevance.total) } as React.CSSProperties}>
                <span>{Math.round(item.relevance.total)}</span>
                <small>of 100</small>
              </div>
              <div className="cl-bars">
                {scoreRows(item.relevance.scores).map((r) => (
                  <div className="cl-bar" key={r.key}>
                    <span>{r.label}</span>
                    <div className="cl-track">
                      <div className="cl-fill" style={{ width: `${r.value * 10}%` }} />
                    </div>
                    <span className="cl-val">{r.value.toFixed(1)}</span>
                  </div>
                ))}
              </div>
              {item.relevance.explanation && (
                <p className="cl-rank-notes">
                  <Prose text={item.relevance.explanation} onCite={cite} />
                </p>
              )}
              {item.relevance.adjustments.length > 0 && (
                <div className="cl-adjustments">
                  {item.relevance.adjustments.map((a) => (
                    <span key={a}>{a}</span>
                  ))}
                </div>
              )}
            </div>

            {item.analysis.length > 0 && (
              <section className="cl-analysis" data-open={openAnalysis}>
                <button type="button" className="cl-analysis-toggle" aria-expanded={openAnalysis} onClick={() => setOpenAnalysis((o) => !o)}>
                  Detailed analysis
                  <span className="cl-plus" aria-hidden>
                    +
                  </span>
                </button>
                <div className="cl-analysis-body" aria-hidden={!openAnalysis}>
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

            <h3 className="cl-block-title">Sources</h3>
            <ol className="cl-source-list">
              {item.sources.map((s) => (
                <li key={s.id} data-source={s.id} className={`cl-source ${flash === s.id ? "cl-flash" : ""}`}>
                  <span className="cl-num">{sourceNumber(s.id)}</span>
                  <div>
                    <a className="cl-title" href={s.url} target="_blank" rel="noopener noreferrer" onClick={followed} onAuxClick={followed}>
                      {s.title}
                    </a>
                    <span className="cl-meta">
                      {s.publisher ?? s.domain}
                      {s.publisher && s.publisher !== s.domain ? ` · ${s.domain}` : ""}
                      {" · "}
                      <span title={dateNote(s.dateSource)}>{s.publishedAt ? formatDay(s.publishedAt) : "date not stated"}</span>
                      {s.dateSource === "provider" || s.dateSource === "unknown" ? " ·" : ""}
                      {s.dateSource === "provider" && " date per search index"}
                      {s.dateSource === "unknown" && " date unverified"}
                    </span>
                  </div>
                  <a className="cl-ext" href={s.url} target="_blank" rel="noopener noreferrer" aria-label="Open source" onClick={followed} onAuxClick={followed}>
                    <ExternalIcon />
                  </a>
                </li>
              ))}
            </ol>

            <details className="cl-verification">
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

            <div className="cl-feedback">
              <span>Tune future briefings</span>
              <button
                type="button"
                className="cl-btn cl-btn-secondary cl-btn-sm"
                aria-pressed={signal === 1}
                onClick={() => onFeedback(item.id, signal === 1 ? 0 : 1)}
              >
                <ThumbUpIcon /> More like this
              </button>
              <button
                type="button"
                className="cl-btn cl-btn-secondary cl-btn-sm"
                aria-pressed={signal === -1}
                onClick={() => onFeedback(item.id, signal === -1 ? 0 : -1)}
              >
                <ThumbDownIcon /> Less like this
              </button>
              <span className="cl-spacer" />
              <button type="button" className="cl-btn cl-btn-ghost cl-btn-sm" disabled={item.rank <= 1} onClick={() => onNavigate(item.rank - 1)}>
                ← Previous
              </button>
              <button type="button" className="cl-btn cl-btn-ghost cl-btn-sm" disabled={item.rank >= total} onClick={() => onNavigate(item.rank + 1)}>
                Next →
              </button>
            </div>
          </article>
        </div>
      )}
    </dialog>
  );
}
