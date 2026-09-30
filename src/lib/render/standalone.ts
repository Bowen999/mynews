import type { BriefingItem, Edition } from "../types";
import { CATEGORY_META } from "../types";
import { formatDay, formatRange } from "../util/dates";
import { categoryLabel, dateNote, escapeHtml, scoreRows, sourceNumber, tokenize } from "./format";

/**
 * Render an edition as a single self-contained, interactive HTML file (inline CSS/JS, no build
 * step, works offline apart from optional web fonts). Stored with each edition.
 */

function prose(text: string, itemRank: number): string {
  return tokenize(text)
    .map((t) => {
      if (t.type === "text") return escapeHtml(t.value);
      if (t.type === "cite")
        return `<sup class="cite"><a href="#i${itemRank}-${t.id}" title="Source ${sourceNumber(t.id)}">${sourceNumber(t.id)}</a></sup>`;
      return `<a class="itemref" href="#item-${t.n}">${t.n}</a>`;
    })
    .join("");
}

function coverProse(text: string): string {
  return tokenize(text)
    .map((t) => (t.type === "text" ? escapeHtml(t.value) : t.type === "itemref" ? `<a class="itemref" href="#item-${t.n}">${t.n}</a>` : ""))
    .join("");
}

function renderItem(it: BriefingItem): string {
  const tone = CATEGORY_META[it.category]?.tone ?? "gray";
  const facts = it.keyFacts.length
    ? `<section><h4>Key facts</h4><ol class="facts">${it.keyFacts
        .map(
          (f) =>
            `<li>${escapeHtml(f.text)} ${f.sources
              .map((s) => `<sup class="cite"><a href="#i${it.rank}-${s}">${sourceNumber(s)}</a></sup>`)
              .join("")}</li>`,
        )
        .join("")}</ol></section>`
    : "";
  const analysis = it.analysis.length
    ? `<details class="analysis"><summary>Detailed analysis</summary>${it.analysis
        .map((a) => `${a.heading ? `<h5>${escapeHtml(a.heading)}</h5>` : ""}<p>${prose(a.body, it.rank)}</p>`)
        .join("")}</details>`
    : "";
  const bars = scoreRows(it.relevance.scores)
    .map(
      (r) =>
        `<div class="bar"><span>${r.label}</span><i><b style="width:${Math.round(r.value * 10)}%"></b></i><em>${r.value.toFixed(1)}</em></div>`,
    )
    .join("");
  const sources = it.sources
    .map(
      (s) => `<li id="i${it.rank}-${s.id}"><span class="sn">${sourceNumber(s.id)}</span><div><a href="${escapeHtml(s.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(
        s.title,
      )}</a><small>${escapeHtml(s.publisher ?? s.domain)} · ${s.publishedAt ? escapeHtml(formatDay(s.publishedAt)) : "date not stated"} <span title="${escapeHtml(
        dateNote(s.dateSource),
      )}">ⓘ</span></small></div></li>`,
    )
    .join("");
  const dates =
    it.dates.earliest && it.dates.latest
      ? it.dates.earliest.slice(0, 10) === it.dates.latest.slice(0, 10)
        ? formatDay(it.dates.earliest)
        : `${formatDay(it.dates.earliest)} – ${formatDay(it.dates.latest)}`
      : "";
  return `<article class="story tone-${tone}" id="item-${it.rank}">
  <div class="eyebrow"><span class="rank">${String(it.rank).padStart(2, "0")}</span><span class="cat">${escapeHtml(categoryLabel(it.category))}</span>${
    dates ? `<span class="date">${escapeHtml(dates)}</span>` : ""
  }<span class="date">${it.sources.length} source${it.sources.length === 1 ? "" : "s"}</span></div>
  <h3>${escapeHtml(it.title)}</h3>
  ${it.whyItMatters ? `<p class="why"><strong>Why it matters · </strong>${prose(it.whyItMatters, it.rank)}</p>` : ""}
  <p class="summary">${prose(it.summary, it.rank)}</p>
  ${facts}
  <section class="rel"><h4>Why it ranks <span class="total">${Math.round(it.relevance.total)}</span></h4><div class="bars">${bars}</div>${
    it.relevance.explanation ? `<p class="small">${prose(it.relevance.explanation, it.rank)}</p>` : ""
  }${it.relevance.adjustments.length ? `<p class="small muted">${it.relevance.adjustments.map(escapeHtml).join(" · ")}</p>` : ""}</section>
  ${analysis}
  <section><h4>Sources</h4><ol class="sources">${sources}</ol></section>
  ${
    it.verification.removedClaims
      ? `<p class="small muted">Verification: ${it.verification.removedClaims} of ${it.verification.checkedClaims} generated claims removed because they could not be matched to a source.</p>`
      : ""
  }
</article>`;
}

const CSS = `
:root{--bg:#f5f5f7;--card:#fff;--text:#1d1d1f;--text2:#6e6e73;--line:rgba(0,0,0,.08);--accent:#fa233b;--shadow:0 1px 2px rgba(0,0,0,.04),0 12px 32px rgba(0,0,0,.06);
--indigo:#5856d6;--red:#e0182d;--green:#248a3d;--orange:#c93400;--teal:#0a7d8c;--brown:#8b6d4a;--purple:#8944ab;--blue:#0066cc;--pink:#d30f45;--gray:#6e6e73;color-scheme:light}
@media (prefers-color-scheme:dark){:root:not([data-theme=light]){--bg:#000;--card:#1c1c1e;--text:#f5f5f7;--text2:#a1a1a6;--line:rgba(255,255,255,.1);--accent:#ff375f;--shadow:none;
--indigo:#7d7aff;--red:#ff453a;--green:#30d158;--orange:#ff9f0a;--teal:#40c8e0;--brown:#c1a07a;--purple:#bf5af2;--blue:#409cff;--pink:#ff375f;--gray:#98989d;color-scheme:dark}}
:root[data-theme=dark]{--bg:#000;--card:#1c1c1e;--text:#f5f5f7;--text2:#a1a1a6;--line:rgba(255,255,255,.1);--accent:#ff375f;--shadow:none;
--indigo:#7d7aff;--red:#ff453a;--green:#30d158;--orange:#ff9f0a;--teal:#40c8e0;--brown:#c1a07a;--purple:#bf5af2;--blue:#409cff;--pink:#ff375f;--gray:#98989d;color-scheme:dark}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--text);font:17px/1.55 -apple-system,BlinkMacSystemFont,"SF Pro Text","Inter","Segoe UI",Roboto,"PingFang SC","Noto Sans SC",sans-serif;-webkit-font-smoothing:antialiased}
.serif,h1,h2,h3{font-family:"Newsreader","New York",ui-serif,"Iowan Old Style",Georgia,"Songti SC","Noto Serif SC",serif}
a{color:inherit}
.wrap{max-width:820px;margin:0 auto;padding:0 20px}
header.top{display:flex;justify-content:space-between;align-items:center;padding:20px 0;border-bottom:1px solid var(--line)}
.brand{font-family:"Newsreader","New York",ui-serif,Georgia,serif;font-weight:700;font-size:22px;letter-spacing:-.02em}
.brand i{color:var(--accent);font-style:normal}
button.theme{border:1px solid var(--line);background:var(--card);color:var(--text);border-radius:999px;padding:6px 12px;font:inherit;font-size:13px;cursor:pointer}
.cover{padding:48px 0 32px}
.kicker{font-size:12px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--accent)}
.cover h1{font-size:clamp(34px,6vw,58px);line-height:1.04;letter-spacing:-.02em;margin:12px 0 16px;font-weight:600}
.dek{font-size:20px;line-height:1.5;color:var(--text2);margin:0}
.meta{margin-top:18px;font-size:13px;color:var(--text2)}
.themes{display:flex;flex-wrap:wrap;gap:8px;margin-top:16px}.themes span{border:1px solid var(--line);border-radius:999px;padding:4px 12px;font-size:13px;color:var(--text2)}
.itemref{display:inline-block;min-width:1.5em;padding:0 .35em;margin:0 .1em;border-radius:6px;background:var(--line);font-size:.75em;font-weight:600;text-align:center;text-decoration:none;vertical-align:.12em}
.story{background:var(--card);border-radius:22px;box-shadow:var(--shadow);border:1px solid var(--line);padding:32px;margin:0 0 20px;scroll-margin-top:16px}
.story .eyebrow{display:flex;flex-wrap:wrap;gap:10px;align-items:baseline;font-size:12px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--text2)}
.story .rank{font-family:"Newsreader",ui-serif,Georgia,serif;font-size:15px;letter-spacing:0;color:var(--tone)}
.story .cat{color:var(--tone)}
.story h3{font-size:clamp(24px,3.4vw,32px);line-height:1.15;letter-spacing:-.015em;margin:10px 0 14px;font-weight:600}
.why{font-size:18px;border-left:3px solid var(--tone);padding:2px 0 2px 14px;margin:0 0 14px}
.summary{margin:0 0 18px}
h4{font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--text2);margin:22px 0 10px;display:flex;align-items:center;gap:8px}
h5{font-size:15px;margin:16px 0 4px}
.facts{margin:0;padding-left:20px}.facts li{margin:6px 0}
.cite{font-size:.62em;line-height:1;vertical-align:.55em;margin-left:2px}.cite a{display:inline-block;min-width:1.5em;line-height:1.45;text-align:center;text-decoration:none;color:var(--tone);font-weight:700;background:color-mix(in srgb,var(--tone) 14%,transparent);border-radius:5px;padding:0 .3em}
.rel .bars{display:grid;gap:6px}.bar{display:grid;grid-template-columns:110px 1fr 34px;align-items:center;gap:10px;font-size:13px;color:var(--text2)}
.bar i{height:6px;border-radius:6px;background:var(--line);overflow:hidden}.bar b{display:block;height:100%;background:var(--tone);border-radius:6px}
.bar em{font-style:normal;text-align:right;font-variant-numeric:tabular-nums}
.total{background:var(--tone);color:#fff;border-radius:999px;padding:1px 9px;font-size:12px;letter-spacing:0}
.small{font-size:14px;color:var(--text2)}.muted{opacity:.8}
details.analysis{margin-top:18px;border-top:1px solid var(--line);padding-top:14px}
details.analysis summary{cursor:pointer;font-weight:600;list-style:none;display:flex;justify-content:space-between}
details.analysis summary::after{content:"+";color:var(--tone);font-size:20px;line-height:1}
details.analysis[open] summary::after{content:"–"}
.sources{list-style:none;padding:0;margin:0;display:grid;gap:10px}
.sources li{display:flex;gap:12px;align-items:flex-start;padding:10px 12px;border-radius:12px;border:1px solid var(--line);transition:background .3s}
.sources li:target{background:color-mix(in srgb,var(--tone) 12%,transparent)}
.sources .sn{flex:none;width:22px;height:22px;border-radius:50%;background:var(--tone);color:#fff;font-size:12px;font-weight:700;display:grid;place-items:center}
.sources a{font-weight:600;text-decoration:none}.sources a:hover{text-decoration:underline}
.sources small{display:block;color:var(--text2);font-size:13px;margin-top:2px}
.also{margin:40px 0}.also li{margin:8px 0}.also a{text-decoration:none;font-weight:600}.also small{color:var(--text2)}
footer{padding:32px 0 60px;color:var(--text2);font-size:13px;border-top:1px solid var(--line)}
${Object.entries({ indigo: 1, red: 1, green: 1, orange: 1, teal: 1, brown: 1, purple: 1, blue: 1, pink: 1, gray: 1 })
  .map(([t]) => `.tone-${t}{--tone:var(--${t})}`)
  .join("")}
@media (max-width:600px){.story{padding:22px;border-radius:18px}.bar{grid-template-columns:92px 1fr 30px}.dek{font-size:18px}}
@media print{button.theme{display:none}.story{box-shadow:none;break-inside:avoid}details.analysis{display:block}}
`;

const JS = `(function(){var r=document.documentElement,k='mynews-theme';try{var s=localStorage.getItem(k);if(s)r.dataset.theme=s}catch(e){}
document.addEventListener('click',function(e){var b=e.target.closest('button.theme');if(!b)return;var d=r.dataset.theme||(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');var n=d==='dark'?'light':'dark';r.dataset.theme=n;try{localStorage.setItem(k,n)}catch(e){}});
})();`;

export function renderStandalone(edition: Edition): string {
  const range = formatRange(edition.windowStart, edition.windowEnd);
  const items = edition.items.map(renderItem).join("\n");
  const also = edition.alsoNoted.length
    ? `<section class="also"><h4>Also noted</h4><p class="small">Other items that ranked just below the top ${edition.items.length}. Links only; not summarized.</p><ul>${edition.alsoNoted
        .map(
          (a) =>
            `<li><a href="${escapeHtml(a.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(a.title)}</a> <small>${escapeHtml(
              a.publisher ?? a.domain,
            )}${a.publishedAt ? ` · ${escapeHtml(formatDay(a.publishedAt))}` : ""}</small></li>`,
        )
        .join("")}</ul></section>`
    : "";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="color-scheme" content="light dark">
<title>${escapeHtml(`Weekly Briefing No. ${edition.number} — ${edition.headline}`)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Newsreader:opsz,wght@6..72,400..700&display=swap" rel="stylesheet">
<style>${CSS}</style>
</head>
<body>
<div class="wrap">
<header class="top"><div class="brand">MyNews<i>.</i></div><button class="theme" type="button" aria-label="Toggle dark mode"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-2px;margin-right:6px"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>Theme</button></header>
<section class="cover">
<div class="kicker">Weekly Briefing · No. ${edition.number}${edition.sample ? " · Sample data" : ""}</div>
<h1>${escapeHtml(edition.headline)}</h1>
<p class="dek serif">${coverProse(edition.dek)}</p>
<div class="meta">${escapeHtml(range)} · ${edition.items.length} stories · ${edition.stats.candidates} results scanned from ${escapeHtml(
    edition.stats.providers.join(", ") || "search",
  )}</div>
${edition.themes.length ? `<div class="themes">${edition.themes.map((t) => `<span>${escapeHtml(t)}</span>`).join("")}</div>` : ""}
</section>
<main>
${items}
${also}
</main>
<footer>Generated ${escapeHtml(new Date(edition.createdAt).toUTCString())} with ${escapeHtml(edition.model.provider)} (${escapeHtml(
    edition.model.model,
  )}). Every statement is linked to its source; claims that could not be matched to a source were removed automatically. Always check primary sources before acting.</footer>
</div>
<script>${JS}</script>
</body>
</html>`;
}
