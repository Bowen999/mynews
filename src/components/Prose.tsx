"use client";

import { Fragment } from "react";
import { sourceNumber, tokenize } from "@/lib/render/format";

interface Props {
  text: string;
  /** Citation click handler; when omitted, citation markers are hidden (clean previews). */
  onCite?: (sourceId: string) => void;
  onItemRef?: (rank: number) => void;
}

/** Renders model prose with [S1] citations as superscript buttons and [3] as item references. */
export function Prose({ text, onCite, onItemRef }: Props) {
  const tokens = tokenize(text);
  return (
    <>
      {tokens.map((t, i) => {
        if (t.type === "text") return <Fragment key={i}>{onCite ? t.value : t.value.replace(/\s+([.,;:!?。，；：])/g, "$1")}</Fragment>;
        if (t.type === "cite") {
          if (!onCite) return null;
          return (
            <sup className="cite" key={i}>
              <button type="button" onClick={() => onCite(t.id)} aria-label={`Source ${sourceNumber(t.id)}`}>
                {sourceNumber(t.id)}
              </button>
            </sup>
          );
        }
        if (!onItemRef) return <Fragment key={i}>{`[${t.n}]`}</Fragment>;
        return (
          <button type="button" key={i} className="itemref" onClick={() => onItemRef(t.n)} aria-label={`Open story ${t.n}`}>
            {t.n}
          </button>
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
