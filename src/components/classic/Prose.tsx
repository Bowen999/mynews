"use client";

import { Fragment } from "react";
import { sourceNumber, tokenize } from "@/lib/render/format";

interface Props {
  text: string;
  /** Citation click handler; when omitted, citation markers are hidden (clean previews). */
  onCite?: (sourceId: string) => void;
  onItemRef?: (rank: number) => void;
}

/** Model prose for the classic front page: [S1] citations as superscript buttons and [3] as story references. */
export function ClassicProse({ text, onCite, onItemRef }: Props) {
  return (
    <>
      {tokenize(text).map((t, i) => {
        if (t.type === "text") return <Fragment key={i}>{onCite ? t.value : t.value.replace(/\s+([.,;:!?。，；：])/g, "$1")}</Fragment>;
        if (t.type === "cite") {
          if (!onCite) return null;
          return (
            <sup className="cl-cite" key={i}>
              <button type="button" onClick={() => onCite(t.id)} aria-label={`Source ${sourceNumber(t.id)}`}>
                {sourceNumber(t.id)}
              </button>
            </sup>
          );
        }
        if (!onItemRef) return <Fragment key={i}>{`[${t.n}]`}</Fragment>;
        return (
          <button type="button" key={i} className="cl-itemref" onClick={() => onItemRef(t.n)} aria-label={`Open story ${t.n}`}>
            {t.n}
          </button>
        );
      })}
    </>
  );
}
