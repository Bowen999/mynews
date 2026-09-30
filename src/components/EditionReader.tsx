"use client";

import { useCallback, useEffect, useState } from "react";
import { categoryLabel } from "@/lib/render/format";
import { CATEGORY_META, type BriefingItem, type Edition } from "@/lib/types";
import { formatDay, formatRange } from "@/lib/util/dates";
import { DownloadIcon, ExternalIcon } from "./Icons";
import { plain, Prose } from "./Prose";
import { dateSpan, StorySheet } from "./StorySheet";

function tone(item: { category: BriefingItem["category"] }) {
  return `tone-${CATEGORY_META[item.category]?.tone ?? "gray"}`;
}

function Eyebrow({ item, showRank = true }: { item: BriefingItem; showRank?: boolean }) {
  return (
    <div className="eyebrow">
      {showRank && <span className="rank">{String(item.rank).padStart(2, "0")}</span>}
      <span>{categoryLabel(item.category)}</span>
    </div>
  );
}

function Foot({ item }: { item: BriefingItem }) {
  return (
    <div className="foot">
      <span>
        {item.sources.length} source{item.sources.length === 1 ? "" : "s"}
      </span>
      {dateSpan(item) && <span>· {dateSpan(item)}</span>}
      <span className="score score-pill" title="Overall score (relevance, impact, novelty, credibility, value)">
        <span className="ring" style={{ "--p": Math.round(item.relevance.total) } as React.CSSProperties} />
        {Math.round(item.relevance.total)}
      </span>
    </div>
  );
}

function Media({ item, showImage, onError }: { item: BriefingItem; showImage: boolean; onError: () => void }) {
  if (showImage && item.imageUrl) {
    return (
      <div className="media">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={item.imageUrl} alt="" loading="lazy" referrerPolicy="no-referrer" onError={onError} />
      </div>
    );
  }
  return (
    <div className="media" aria-hidden>
      <span className="big">{String(item.rank).padStart(2, "0")}</span>
    </div>
  );
}

function Card({ item, variant, index, onOpen }: { item: BriefingItem; variant: "lead" | "feature" | "standard"; index: number; onOpen: (rank: number) => void }) {
  const [imgFailed, setImgFailed] = useState(false);
  const open = (e: React.MouseEvent) => {
    e.preventDefault();
    onOpen(item.rank);
  };
  const hasImage = Boolean(item.imageUrl) && !imgFailed;
  const typo = variant === "standard" || !hasImage;

  if (variant === "lead") {
    return (
      <a href={`#story-${item.rank}`} onClick={open} className={`card lead reveal ${tone(item)}`} style={{ "--i": index } as React.CSSProperties}>
        <div className="body">
          <Eyebrow item={item} />
          <h3>{item.title}</h3>
          {item.whyItMatters && <p className="why">{plain(item.whyItMatters)}</p>}
          <p className="summary-preview">{plain(item.summary)}</p>
          <span className="read-more">
            Read the full brief <span className="arrow">→</span>
          </span>
          <Foot item={item} />
        </div>
        {hasImage ? (
          <div className="side has-media">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={item.imageUrl} alt="" referrerPolicy="no-referrer" onError={() => setImgFailed(true)} />
          </div>
        ) : (
          <div className="side">
            <span className="side-title">{item.keyFacts.length ? "Key facts" : "Sources"}</span>
            {item.keyFacts.length ? (
              <ol className="side-facts">
                {item.keyFacts.slice(0, 4).map((f, i) => (
                  <li key={i}>{f.text}</li>
                ))}
              </ol>
            ) : (
              <ol className="side-facts">
                {item.sources.slice(0, 4).map((s) => (
                  <li key={s.id}>{s.publisher ?? s.domain}</li>
                ))}
              </ol>
            )}
          </div>
        )}
      </a>
    );
  }

  return (
    <a
      href={`#story-${item.rank}`}
      onClick={open}
      className={`card ${variant === "feature" ? "feature" : ""} ${typo ? "typo" : ""} reveal ${tone(item)}`}
      style={{ "--i": index } as React.CSSProperties}
    >
      <Media item={item} showImage={!typo} onError={() => setImgFailed(true)} />
      <div className="body">
        <Eyebrow item={item} showRank={!typo} />
        <h3>{item.title}</h3>
        {item.whyItMatters && <p className="why">{plain(item.whyItMatters)}</p>}
        <Foot item={item} />
      </div>
    </a>
  );
}

interface Props {
  edition: Edition;
  initialFeedback: Record<string, 1 | -1>;
}

export function EditionReader({ edition, initialFeedback }: Props) {
  const [openRank, setOpenRank] = useState<number | null>(null);
  const [feedback, setFeedback] = useState(initialFeedback);
  const items = edition.items;
  const lead = items[0];
  const features = items.slice(1, 3);
  const rest = items.slice(3);

  const open = useCallback(
    (rank: number) => {
      if (rank < 1 || rank > items.length) return;
      setOpenRank(rank);
      window.history.replaceState(null, "", `#story-${rank}`);
    },
    [items.length],
  );

  const close = useCallback(() => {
    setOpenRank(null);
    if (window.location.hash.startsWith("#story-")) window.history.replaceState(null, "", window.location.pathname + window.location.search);
  }, []);

  useEffect(() => {
    const m = window.location.hash.match(/^#story-(\d+)$/);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (m) setOpenRank(Number(m[1]));
  }, []);

  const sendFeedback = async (itemId: string, signal: 1 | -1 | 0) => {
    const prev = feedback;
    const next = { ...feedback };
    if (signal === 0) delete next[itemId];
    else next[itemId] = signal;
    setFeedback(next);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ editionId: edition.id, itemId, signal }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setFeedback(prev);
    }
  };

  const range = formatRange(edition.windowStart, edition.windowEnd);
  const openItem = openRank ? (items.find((i) => i.rank === openRank) ?? null) : null;

  return (
    <>
      <section className="cover">
        <div className="kicker reveal">
          <span>Weekly Briefing · No. {edition.number}</span>
          <span className="muted">{range}</span>
          {edition.sample && <span className="sample-badge">Sample data</span>}
        </div>
        <h1 className="reveal" style={{ "--i": 1 } as React.CSSProperties}>
          {edition.headline}
        </h1>
        {edition.dek && (
          <p className="dek reveal" style={{ "--i": 2 } as React.CSSProperties}>
            <Prose text={edition.dek} onItemRef={open} />
          </p>
        )}
        {edition.themes.length > 0 && (
          <div className="chips reveal" style={{ "--i": 3 } as React.CSSProperties}>
            {edition.themes.map((t) => (
              <span className="chip" key={t}>
                {t}
              </span>
            ))}
          </div>
        )}
        <p className="cover-meta reveal" style={{ "--i": 4 } as React.CSSProperties}>
          {[
            `${items.length} stories`,
            `${edition.stats.candidates.toLocaleString()} results scanned`,
            `${edition.stats.clusters} stories considered`,
            edition.stats.providers.length ? `via ${edition.stats.providers.join(", ")}` : "",
          ]
            .filter(Boolean)
            .join("  ·  ")}
        </p>
      </section>

      <div className="section-head">
        <h2>This week&apos;s top {items.length}</h2>
        <p>Ranked by relevance, impact, novelty, credibility and value to you</p>
      </div>

      <div className="story-grid">
        {lead && <Card item={lead} variant="lead" index={0} onOpen={open} />}
        {features.map((it, i) => (
          <Card key={it.id} item={it} variant="feature" index={i + 1} onOpen={open} />
        ))}
        {rest.map((it, i) => (
          <Card key={it.id} item={it} variant="standard" index={i + 3} onOpen={open} />
        ))}
      </div>

      {edition.alsoNoted.length > 0 && (
        <>
          <div className="section-head">
            <h2>Also noted</h2>
            <p>Ranked just below the top {items.length}. Links only, not summarized.</p>
          </div>
          <ul className="also-list">
            {edition.alsoNoted.map((a) => (
              <li key={a.url} className={`tone-${CATEGORY_META[a.category]?.tone ?? "gray"}`}>
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

      <footer className="edition-foot">
        <p>
          Generated {new Date(edition.createdAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })} with{" "}
          {edition.model.provider} ({edition.model.model}) from {edition.stats.queries} searches. Every statement links to its source;
          {edition.stats.removedClaims
            ? ` ${edition.stats.removedClaims} generated statement${edition.stats.removedClaims === 1 ? " was" : "s were"} removed because no source supported ${edition.stats.removedClaims === 1 ? "it" : "them"}.`
            : " all generated statements matched their sources."}{" "}
          Check primary sources before acting.
        </p>
        <div className="actions">
          <a className="btn btn-secondary btn-sm" href={`/editions/${edition.id}/standalone`} target="_blank" rel="noopener">
            <ExternalIcon /> Standalone page
          </a>
          <a className="btn btn-secondary btn-sm" href={`/editions/${edition.id}/standalone?download=1`}>
            <DownloadIcon /> Download HTML
          </a>
        </div>
      </footer>

      <StorySheet item={openItem} total={items.length} feedback={feedback} onFeedback={sendFeedback} onClose={close} onNavigate={open} />
    </>
  );
}
