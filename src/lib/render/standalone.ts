import type { BriefingItem, Edition } from "../types";
import { formatDay, formatRange } from "../util/dates";
import { categoryLabel, dateNote, escapeHtml, scoreRows, sourceNumber, tokenize } from "./format";

/**
 * Render an edition as a single self-contained, interactive HTML file (inline CSS/JS, no build
 * step; works offline apart from optional web fonts). Stored with each edition.
 */

const pad = (n: number) => String(n).padStart(2, "0");

function prose(text: string, rank: number): string {
  return tokenize(text)
    .map((t) => {
      if (t.type === "text") return escapeHtml(t.value);
      if (t.type === "cite") return `<sup class="cite"><a href="#s${rank}-${sourceNumber(t.id)}">${sourceNumber(t.id)}</a></sup>`;
      return `<a class="itemref" href="#story-${t.n}">${t.n}</a>`;
    })
    .join("");
}

function coverProse(text: string): string {
  return tokenize(text)
    .map((t) => (t.type === "text" ? escapeHtml(t.value) : t.type === "itemref" ? `<a class="itemref" href="#story-${t.n}">${t.n}</a>` : ""))
    .join("");
}

function dates(it: BriefingItem): string {
  const { earliest, latest } = it.dates;
  if (!earliest) return "";
  return !latest || earliest.slice(0, 10) === latest.slice(0, 10) ? formatDay(earliest) : `${formatDay(earliest)} – ${formatDay(latest)}`;
}

function renderItem(it: BriefingItem): string {
  const meta = [dates(it), `${it.sources.length} source${it.sources.length === 1 ? "" : "s"}`, `Score ${Math.round(it.relevance.total)}/100`]
    .filter(Boolean)
    .join(" · ");
  const facts = it.keyFacts.length
    ? `<div class="block"><h4>Key facts</h4><ol class="facts">${it.keyFacts
        .map((f) => `<li>${escapeHtml(f.text)}${f.sources.map((s) => `<sup class="cite"><a href="#s${it.rank}-${sourceNumber(s)}">${sourceNumber(s)}</a></sup>`).join("")}</li>`)
        .join("")}</ol></div>`
    : "";
  const bars = scoreRows(it.relevance.scores)
    .map((r) => `<div class="bar"><span>${r.label}</span><i><b style="width:${Math.round(r.value * 10)}%"></b></i><em>${r.value.toFixed(1)}</em></div>`)
    .join("");
  const analysis = it.analysis.length
    ? `<details class="analysis"><summary>Detailed analysis <span>+</span></summary>${it.analysis
        .map((a) => `${a.heading ? `<h5>${escapeHtml(a.heading)}</h5>` : ""}<p>${prose(a.body, it.rank)}</p>`)
        .join("")}</details>`
    : "";
  const sources = it.sources
    .map(
      (s) =>
        `<li id="s${it.rank}-${sourceNumber(s.id)}"><span>${pad(Number(sourceNumber(s.id)))}</span><div><a href="${escapeHtml(s.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(
          s.title,
        )} ↗</a><small>${escapeHtml(s.publisher ?? s.domain)} · <span title="${escapeHtml(dateNote(s.dateSource))}">${
          s.publishedAt ? escapeHtml(formatDay(s.publishedAt)) : "date not stated"
        }</span></small></div></li>`,
    )
    .join("");
  return `<article class="story" id="story-${it.rank}">
  <div class="kicker"><span>${pad(it.rank)}</span><span>${escapeHtml(categoryLabel(it.category))}</span></div>
  <h3>${escapeHtml(it.title)}</h3>
  <p class="meta">${escapeHtml(meta)}</p>
  <div class="block"><h4>Summary</h4><p>${prose(it.summary, it.rank)}</p></div>
  ${facts}
  <div class="block"><h4>Why it ranks</h4><div><div class="bars">${bars}</div>${
    it.relevance.explanation ? `<p class="small">${prose(it.relevance.explanation, it.rank)}</p>` : ""
  }${it.relevance.adjustments.length ? `<p class="small">${it.relevance.adjustments.map(escapeHtml).join(" · ")}</p>` : ""}</div></div>
  ${analysis ? `<div class="block"><h4>Analysis</h4><div>${analysis}</div></div>` : ""}
  <div class="block"><h4>Sources</h4><ol class="sources">${sources}</ol></div>
</article>`;
}

const CSS = `
:root{--bg:#fff;--ink:#111;--ink2:#545454;--ink3:#8c8c8c;--hair:#e2e2e0;--wash:#f5f5f3;--brand:#fa233b;color-scheme:light}
@media (prefers-color-scheme:dark){:root:not([data-theme=light]){--bg:#0f0f0f;--ink:#f1f1ef;--ink2:#a9a9a6;--ink3:#74746f;--hair:#2a2a28;--wash:#181817;--brand:#ff375f;color-scheme:dark}}
:root[data-theme=dark]{--bg:#0f0f0f;--ink:#f1f1ef;--ink2:#a9a9a6;--ink3:#74746f;--hair:#2a2a28;--wash:#181817;--brand:#ff375f;color-scheme:dark}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.5 "Inter Tight","Helvetica Neue",Helvetica,Arial,"PingFang SC","Noto Sans SC",sans-serif;-webkit-font-smoothing:antialiased}
a{color:inherit}
.wrap{max-width:980px;margin:0 auto;padding:0 20px}
header.top{display:flex;justify-content:space-between;align-items:center;height:60px;border-bottom:1px solid var(--hair)}
.brand{font-weight:700;font-size:22px;letter-spacing:-.04em;line-height:1}.brand::after{content:".";color:var(--brand)}
@media(max-width:420px){.brand{font-size:20px}}
button.theme{border:1px solid var(--hair);background:none;color:var(--ink2);padding:6px 12px;font:inherit;font-size:13px;cursor:pointer}
.label,.kicker,h4{font-size:12px;font-weight:600;letter-spacing:.08em;text-transform:uppercase}
.cover{padding:48px 0 0}
.cover .line{display:flex;justify-content:space-between;gap:12px;padding-bottom:12px;border-bottom:2px solid var(--ink)}
.cover .line .muted{color:var(--ink3)}
h1{font-weight:600;font-size:clamp(40px,8vw,84px);line-height:.96;letter-spacing:-.04em;margin:32px 0 22px;max-width:14ch}
.dek{font-family:"Source Serif 4",Georgia,"Songti SC",serif;font-size:clamp(19px,2.4vw,24px);line-height:1.42;color:var(--ink2);margin:0;max-width:40ch}
.stats{margin-top:20px;font-size:14px;color:var(--ink2)}
.itemref{font-size:.62em;font-weight:600;vertical-align:.4em;margin:0 .12em;text-underline-offset:2px}
.toc{list-style:none;margin:40px 0 0;padding:0;border-top:2px solid var(--ink)}
.toc li{border-bottom:1px solid var(--hair)}
.toc a{display:grid;grid-template-columns:48px 1fr auto;gap:12px;padding:14px 0;text-decoration:none;align-items:baseline}
.toc a b{font-weight:600;font-size:18px;letter-spacing:-.015em}
.toc a span{font-size:12px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--ink3)}
.toc a:hover b{text-decoration:underline;text-underline-offset:3px}
.story{padding:28px 0 8px;margin-top:56px;border-top:2px solid var(--ink);scroll-margin-top:12px}
.kicker{display:flex;gap:14px}
.kicker span:first-child{color:var(--ink3)}
.story h3{font-weight:600;font-size:clamp(28px,4.4vw,46px);line-height:1.04;letter-spacing:-.03em;margin:18px 0 12px;max-width:22ch}
.meta{font-size:14px;color:var(--ink2);margin:0 0 6px}
.block{display:grid;grid-template-columns:180px 1fr;gap:24px;padding:22px 0;border-top:1px solid var(--hair)}
.block h4{margin:4px 0 0;color:var(--ink)}
.block p,.facts li,.analysis p{font-family:"Source Serif 4",Georgia,"Songti SC",serif;font-size:18px;line-height:1.6;margin:0}

.facts{margin:0;padding:0;list-style:none;counter-reset:k}
.facts li{counter-increment:k;display:grid;grid-template-columns:36px 1fr;padding:10px 0;border-top:1px solid var(--hair)}
.facts li:first-child{border-top:0;padding-top:0}
.facts li::before{content:counter(k,decimal-leading-zero);font-family:"Inter Tight",sans-serif;font-size:12px;font-weight:600;color:var(--ink3);padding-top:4px}
.cite{font-family:"Inter Tight",sans-serif;font-size:.6em;vertical-align:.55em;line-height:1}
.cite a{font-weight:600;color:var(--ink2);text-underline-offset:2px}
.cite+.cite::before{content:",";color:var(--ink3)}
.bars{display:grid;gap:8px}
.bar{display:grid;grid-template-columns:110px 1fr 34px;gap:12px;align-items:center;font-size:14px;color:var(--ink2)}
.bar i{height:2px;background:var(--hair);position:relative}.bar b{position:absolute;inset:0 auto 0 0;background:var(--ink)}
.bar em{font-style:normal;text-align:right;font-weight:600;color:var(--ink)}
.small{font-size:15px!important;color:var(--ink2);margin-top:12px!important}
details.analysis summary{cursor:pointer;list-style:none;display:flex;justify-content:space-between;font-weight:600;font-size:18px}
details.analysis summary::-webkit-details-marker{display:none}
details.analysis summary span{border:1px solid var(--ink);width:26px;height:26px;display:grid;place-items:center;font-weight:400;transition:transform .3s}
details.analysis[open] summary span{transform:rotate(45deg)}
details.analysis h5{font-size:16px;margin:20px 0 6px}
.sources{list-style:none;margin:0;padding:0}
.sources li{display:grid;grid-template-columns:36px 1fr;padding:10px 0;border-top:1px solid var(--hair)}
.sources li:first-child{border-top:0;padding-top:0}
.sources li:target{background:var(--wash)}
.sources li>span{font-size:12px;font-weight:600;color:var(--ink3);padding-top:3px}
.sources a{font-weight:600;text-decoration-color:var(--hair);text-underline-offset:3px;overflow-wrap:anywhere}
.sources small{display:block;color:var(--ink3);font-size:13px;margin-top:3px}
.also{margin-top:56px;border-top:2px solid var(--ink);padding-top:14px}
.also ul{list-style:none;padding:0;margin:12px 0 0}.also li{padding:10px 0;border-top:1px solid var(--hair)}
.also a{font-weight:600;text-decoration:none}.also a:hover{text-decoration:underline}.also small{display:block;color:var(--ink3);font-size:13px}
footer{margin-top:64px;padding:20px 0 56px;border-top:1px solid var(--hair);font-family:"Source Serif 4",Georgia,serif;font-size:14px;color:var(--ink2)}
@media (max-width:640px){.block{grid-template-columns:1fr;gap:10px}.bar{grid-template-columns:90px 1fr 30px}.toc a{grid-template-columns:36px 1fr}.toc a span{display:none}.cover .line{flex-direction:column}}
@media print{button.theme{display:none}details.analysis{display:block}.story{break-inside:avoid-page}}
`;

const JS = `(function(){var r=document.documentElement,k='mynews-theme';try{var s=localStorage.getItem(k);if(s)r.dataset.theme=s}catch(e){}
document.addEventListener('click',function(e){var b=e.target.closest('button.theme');if(!b)return;var d=r.dataset.theme||(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');var n=d==='dark'?'light':'dark';r.dataset.theme=n;try{localStorage.setItem(k,n)}catch(e){}});})();`;

export function renderStandalone(edition: Edition): string {
  const range = formatRange(edition.windowStart, edition.windowEnd);
  const toc = edition.items
    .map((it) => `<li><a href="#story-${it.rank}"><span>${pad(it.rank)}</span><b>${escapeHtml(it.title)}</b><span>${escapeHtml(categoryLabel(it.category))}</span></a></li>`)
    .join("");
  const also = edition.alsoNoted.length
    ? `<section class="also"><div class="label">Also noted</div><ul>${edition.alsoNoted
        .map(
          (a) =>
            `<li><a href="${escapeHtml(a.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(a.title)}</a><small>${escapeHtml(
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
<meta name="robots" content="noindex">
<title>${escapeHtml(`Weekly Briefing No. ${edition.number} — ${edition.headline}`)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter+Tight:wght@400;500;600;700&family=Source+Serif+4:opsz,wght@8..60,400;8..60,600&display=swap" rel="stylesheet">
<style>${CSS}</style>
</head>
<body>
<div class="wrap">
<header class="top"><div class="brand">MyNews</div><button class="theme" type="button" aria-label="Toggle dark mode">Light / Dark</button></header>
<section class="cover">
<div class="line label"><span>Weekly Briefing — No. ${edition.number}${edition.sample ? " · Sample data" : ""}</span><span class="muted">${escapeHtml(range)}</span></div>
<h1>${escapeHtml(edition.headline)}</h1>
<p class="dek">${coverProse(edition.dek)}</p>
<p class="stats">${edition.items.length} stories · ${edition.stats.candidates} results scanned · ${escapeHtml(edition.stats.providers.join(", ") || "search")}${
    edition.themes.length ? ` · ${escapeHtml(edition.themes.join(" / "))}` : ""
  }</p>
<ol class="toc">${toc}</ol>
</section>
<main>
${edition.items.map(renderItem).join("\n")}
${also}
</main>
<footer>Generated ${escapeHtml(new Date(edition.createdAt).toUTCString())} with ${escapeHtml(edition.model.provider)} (${escapeHtml(
    edition.model.model,
  )}). Every statement is linked to its source; claims that could not be matched to a source were removed automatically. Check primary sources before acting.</footer>
</div>
<script>${JS}</script>
</body>
</html>`;
}
