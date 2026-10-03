import { config } from "../config";
import { extractUrl, fetchPage, jinaHtml, jinaRead } from "../extract";
import { mockSourceDocument } from "../mock/corpus";
import { bodyText, findOrcid, parseScholarProfile, scholarUserId } from "../extract/html";
import type { SourceSnapshot } from "../types";
import { pMap } from "../util/concurrency";
import { collapseWhitespace, sha1, truncate } from "../util/text";
import { domainOf } from "../util/url";
import { NeedsInputError, type StageContext, type StageResult } from "./context";

const MAX_SOURCES = 12;
const MAX_TEXT = 14000;

function scholarSnapshot(url: string, html: string, via: "direct" | "jina"): Omit<SourceSnapshot, "fetchedAt" | "hash"> | null {
  const scholar = parseScholarProfile(html);
  if (!scholar?.name) return null;
  const text = [
    `Google Scholar profile: ${scholar.name}`,
    scholar.affiliation ? `Affiliation: ${scholar.affiliation}` : "",
    scholar.interests.length ? `Research interests: ${scholar.interests.join(", ")}` : "",
    scholar.paperTitles.length ? `Publications:\n- ${scholar.paperTitles.join("\n- ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");
  return {
    url,
    title: `${scholar.name} - Google Scholar`,
    text,
    status: "ok",
    via,
    hints: {
      scholarName: scholar.name,
      scholarAffiliation: scholar.affiliation,
      scholarInterests: scholar.interests,
      paperTitles: scholar.paperTitles,
      scholarUserId: scholarUserId(url),
      scholarPapers: scholar.papers,
    },
  };
}

async function readScholar(url: string): Promise<Omit<SourceSnapshot, "fetchedAt" | "hash">> {
  // Google Scholar often blocks servers: try direct, then Jina Reader's rendered HTML (keeps citation ids), then its text.
  const target = url.includes("hl=") ? url : `${url}${url.includes("?") ? "&" : "?"}hl=en`;
  try {
    const snap = scholarSnapshot(url, (await fetchPage(target, 12000)).body, "direct");
    if (snap) return snap;
  } catch {
    // fall through to Jina
  }
  try {
    const snap = scholarSnapshot(url, await jinaHtml(target), "jina");
    if (snap) return snap;
  } catch {
    // fall through to plain text
  }
  const viaJina = await jinaRead(url);
  return { url, title: viaJina.title, text: viaJina.text, status: "ok", via: "jina" };
}

async function readSource(url: string): Promise<Omit<SourceSnapshot, "fetchedAt" | "hash">> {
  if (config.mockMode) {
    const doc = mockSourceDocument(url);
    return { url, title: doc.title, text: doc.text, status: "ok", via: "direct", hints: doc.hints };
  }
  if (/scholar\.google\./.test(domainOf(url))) return readScholar(url);
  const page = await extractUrl(url, { allowJina: true, timeoutMs: 15000 });
  const orcid = findOrcid(page.html ?? page.text);
  // Keep list-like content (publication lists) that Readability may drop on homepages.
  let text = page.text;
  if (page.html && text.length < 3000) {
    const full = bodyText(page.html);
    if (full.length > text.length * 1.5) text = full;
  }
  return {
    url,
    title: page.title,
    text: [page.description, text].filter(Boolean).join("\n\n"),
    status: "ok",
    via: page.via,
    hints: orcid ? { orcid } : undefined,
  };
}

/** Stage 1: fetch and snapshot every reference source; fall back to cached snapshots on failure. */
export async function sourcesStage(ctx: StageContext): Promise<StageResult> {
  const sources = ctx.profile.sources.slice(0, MAX_SOURCES);
  if (!sources.length) {
    throw new NeedsInputError([
      { key: "SOURCES", message: "No reference sources yet.", action: "Add one on the Profile page." },
    ]);
  }
  let done = 0;
  const snapshots = await pMap(
    sources,
    async (src): Promise<SourceSnapshot> => {
      const fetchedAt = new Date().toISOString();
      try {
        const read = await readSource(src.url);
        const text = truncate(collapseWhitespace(read.text), MAX_TEXT);
        if (text.length < 80) throw new Error("page had almost no readable text");
        const snap: SourceSnapshot = { ...read, text, fetchedAt, hash: sha1(text) };
        await ctx.store.saveSnapshot(snap);
        return snap;
      } catch (e) {
        const error = e instanceof Error ? e.message : String(e);
        const cached = await ctx.store.getSnapshot(src.url);
        if (cached?.status === "ok") {
          ctx.log("warn", `Could not refresh ${src.url} (${error}); using snapshot from ${cached.fetchedAt.slice(0, 10)}.`);
          return { ...cached, via: "cache" };
        }
        ctx.log("warn", `Could not read ${src.url}: ${error}`);
        return { url: src.url, text: "", fetchedAt, status: "error", error, via: "none", hash: "" };
      } finally {
        done++;
        await ctx.detail(`Read ${done} of ${sources.length} sources`);
      }
    },
    4,
  );

  const ok = snapshots.filter((s) => s.status === "ok");
  if (!ok.length && !ctx.profile.interest) {
    throw new NeedsInputError([
      {
        key: "SOURCES_UNREADABLE",
        message: "None of your sources could be read.",
        action: "Check them on the Profile page, or add a public homepage (Google Scholar often blocks servers).",
      },
    ]);
  }
  if (!ok.length) ctx.log("warn", "No source could be read; reusing the previous interest profile.");
  ctx.run.state.snapshots = snapshots;
  await ctx.detail(`${ok.length} of ${sources.length} sources read`);
  return { done: true };
}
