import { Fragment } from "react";
import { sourceNumber, tokenize } from "@/lib/render/format";

interface Props {
  text: string;
  /** Render [S1] markers as superscript links to #source-1. When false, markers are dropped. */
  cite?: boolean;
  /** Link target for item references like [3] in edition text. */
  itemHref?: (rank: number) => string;
}

/** Model prose with citation superscripts (server- and client-safe, no interactivity needed). */
export function Prose({ text, cite = true, itemHref }: Props) {
  return (
    <>
      {tokenize(text).map((t, i) => {
        if (t.type === "text") return <Fragment key={i}>{cite ? t.value : t.value.replace(/\s+([.,;:!?。，；：])/g, "$1")}</Fragment>;
        if (t.type === "cite") {
          if (!cite) return null;
          const n = sourceNumber(t.id);
          return (
            <sup className="cite" key={i}>
              <a href={`#source-${n}`} aria-label={`Source ${n}`}>
                {n}
              </a>
            </sup>
          );
        }
        if (!itemHref) return <Fragment key={i}>{`[${t.n}]`}</Fragment>;
        return (
          <a key={i} className="itemref" href={itemHref(t.n)} aria-label={`Story ${t.n}`}>
            {t.n}
          </a>
        );
      })}
    </>
  );
}

export function plain(text: string): string {
  return text
    .replace(/\[S\d+\]/g, "")
    .replace(/\s+([.,;:!?。，；：])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
}
