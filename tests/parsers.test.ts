import { describe, expect, it } from "vitest";
import { extractFromHtml, parseScholarProfile, scholarUserId } from "../src/lib/extract/html";
import { buildArxivQuery, parseArxivFeed } from "../src/lib/search/arxiv";
import { epmcQuery, normalizeEpmc } from "../src/lib/search/europepmc";
import { parseFeed } from "../src/lib/search/feeds";
import { isScholarBlocked, parseAge, parseScholarResults, scholarSearchUrl } from "../src/lib/search/scholar";
import { normalizeS2Paper, paperUrl } from "../src/lib/search/semanticscholar";
import { parseRss, unwrapBingLink } from "../src/lib/search/rss";

describe("RSS", () => {
  it("parses Bing News RSS and unwraps redirect links", () => {
    const xml = `<?xml version="1.0"?><rss xmlns:News="https://www.bing.com/news/search?q=x&amp;format=rss"><channel><item>
      <title>Lipid startup raises &amp; expands</title>
      <link>http://www.bing.com/news/apiclick.aspx?ref=FexRss&amp;aid=&amp;url=https%3a%2f%2fnews.example.com%2fstory%3fid%3d1&amp;c=1</link>
      <description>Snippet &lt;b&gt;bold&lt;/b&gt;</description>
      <pubDate>Mon, 28 Sep 2026 08:00:00 GMT</pubDate>
      <News:Source>Example News</News:Source>
    </item></channel></rss>`;
    const [item] = parseRss(xml);
    expect(item.title).toBe("Lipid startup raises & expands");
    expect(item.description).toBe("Snippet bold");
    expect(item.source).toBe("Example News");
    expect(unwrapBingLink(item.link)).toBe("https://news.example.com/story?id=1");
  });
  it("parses Google News RSS source element", () => {
    const xml = `<rss><channel><item><title>Big result - Example Times</title><link>https://news.google.com/rss/articles/abc</link>
      <pubDate>Tue, 29 Sep 2026 10:00:00 GMT</pubDate><source url="https://times.example.com">Example Times</source></item></channel></rss>`;
    const [item] = parseRss(xml);
    expect(item.source).toBe("Example Times");
    expect(item.sourceUrl).toBe("https://times.example.com");
  });
});

describe("arXiv", () => {
  it("builds date-bounded queries", () => {
    const q = buildArxivQuery("single-cell lipidomics imaging", new Date("2026-09-23T00:00:00Z"), new Date("2026-09-30T00:00:00Z"));
    expect(q).toBe("(all:single-cell AND all:lipidomics AND all:imaging) AND submittedDate:[202609230000 TO 202609300000]");
  });
  it("parses Atom entries", () => {
    const xml = `<feed xmlns="http://www.w3.org/2005/Atom" xmlns:arxiv="http://arxiv.org/schemas/atom"><entry>
      <id>http://arxiv.org/abs/2609.01234v2</id><published>2026-09-27T17:00:00Z</published>
      <title>A  Title
      Here</title><summary>Abstract text.</summary>
      <author><name>A. One</name></author><author><name>B. Two</name></author>
      <arxiv:primary_category term="q-bio.QM"/></entry></feed>`;
    const [r] = parseArxivFeed(xml);
    expect(r.url).toBe("https://arxiv.org/abs/2609.01234");
    expect(r.title).toBe("A Title Here");
    expect(r.authors).toEqual(["A. One", "B. Two"]);
    expect(r.venue).toBe("arXiv q-bio.QM");
  });
});

describe("Semantic Scholar", () => {
  it("prefers DOI/arXiv links, keeps the paper id and drops undated papers", () => {
    const r = normalizeS2Paper(
      {
        paperId: "abc123",
        title: "A  Paper",
        abstract: "Abstract text.",
        publicationDate: "2026-09-28",
        venue: "",
        journal: { name: "Journal X" },
        externalIds: { DOI: "10.1/ABC", ArXiv: "2609.1" },
        authors: [{ authorId: "1", name: "A. One" }],
      },
      "cites-your-work",
    );
    expect(r).toMatchObject({
      url: "https://doi.org/10.1/abc",
      title: "A Paper",
      doi: "10.1/abc",
      venue: "Journal X",
      paperId: "abc123",
      signals: ["cites-your-work"],
      dateSource: "metadata",
      provider: "semantic-scholar",
    });
    expect(paperUrl({ externalIds: { ArXiv: "2609.00001" } })).toBe("https://arxiv.org/abs/2609.00001");
    expect(normalizeS2Paper({ title: "Undated", url: "https://www.semanticscholar.org/paper/x", year: 2026 })).toBeNull();
  });
});

describe("Europe PMC", () => {
  it("builds a date-bounded query and normalizes results", () => {
    expect(epmcQuery('lipid "single cell" (MALDI)', new Date("2026-09-25T00:00:00Z"), new Date("2026-10-02T00:00:00Z"))).toBe(
      '(lipid "single cell" MALDI) AND (FIRST_PDATE:[2026-09-25 TO 2026-10-02])',
    );
    expect(epmcQuery('broken "quote', new Date("2026-09-25"), new Date("2026-10-02"))).toMatch(/^\(broken quote\)/);
    const r = normalizeEpmc({
      id: "PPR1",
      source: "PPR",
      title: "Lipid <i>maps</i> of cells.",
      authorString: "Rivera A, Okafor D.",
      firstPublicationDate: "2026-09-29",
      abstractText: "<h4>Background</h4>Text here.",
      bookOrReportDetails: { publisher: "bioRxiv" },
    });
    expect(r).toMatchObject({
      url: "https://europepmc.org/article/PPR/PPR1",
      title: "Lipid maps of cells",
      venue: "bioRxiv",
      authors: ["Rivera A", "Okafor D"],
      publishedAt: "2026-09-29",
    });
    expect(r?.content).toBe("Background Text here.");
  });
});

describe("Google Scholar", () => {
  const page = `<div class="gs_r gs_or gs_scl" data-cid="x1"><div class="gs_ri">
      <h3 class="gs_rt"><span class="gs_ctc">[HTML]</span> <a href="https://journal.example.org/a1">Lipidome maps of <b>single</b> cells</a></h3>
      <div class="gs_a">A Rivera, D Okafor - Journal of Example Chemistry, 2026 - journal.example.org</div>
      <div class="gs_rs"><span class="gs_age">3 days ago - </span>We profiled 1,200 single hepatocytes …</div>
      <div class="gs_fl"><a href="/scholar?cites=999">Cited by 2</a></div></div></div>
    <div class="gs_r gs_or gs_scl"><div class="gs_ri"><h3 class="gs_rt"><span>[CITATION]</span> No link here</h3>
      <div class="gs_rs"><span class="gs_age">1 day ago - </span>x</div></div></div>
    <div class="gs_r gs_or gs_scl"><div class="gs_ri"><h3 class="gs_rt"><a href="https://b.example.com/x">Old paper without age</a></h3>
      <div class="gs_rs">No age prefix</div></div></div>`;
  it("parses date-sorted results with approximate dates", () => {
    const now = new Date("2026-10-02T12:00:00Z");
    const results = parseScholarResults(page, now, "cites-your-work");
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      url: "https://journal.example.org/a1",
      title: "Lipidome maps of single cells",
      snippet: "We profiled 1,200 single hepatocytes …",
      publishedAt: "2026-09-29T12:00:00.000Z",
      dateSource: "provider",
      venue: "Journal of Example Chemistry",
      authors: ["A Rivera", "D Okafor"],
      signals: ["cites-your-work"],
      provider: "google-scholar",
    });
    expect(parseAge("11 hours ago - ")).toBe(0);
  });
  it("builds search and cites URLs and detects captchas", () => {
    expect(scholarSearchUrl({ query: "lipidomics", scholarCites: undefined })).toContain("q=lipidomics");
    expect(scholarSearchUrl({ query: "x", scholarCites: "123" })).toMatch(/cites=123/);
    expect(scholarSearchUrl({ query: "x" })).toContain("scisbd=1");
    expect(isScholarBlocked('<div id="gs_captcha_ccl">')).toBe(true);
    expect(isScholarBlocked(page)).toBe(false);
  });
});

describe("Watchlist feeds", () => {
  it("parses RSS and Atom", () => {
    const rss = parseFeed(`<rss><channel><title>Lab news</title><item><title>New grant</title><link>https://lab.example.edu/n/1</link><description>&lt;p&gt;We won&lt;/p&gt;</description><pubDate>Mon, 28 Sep 2026 10:00:00 GMT</pubDate></item></channel></rss>`);
    expect(rss).toEqual({ title: "Lab news", entries: [{ title: "New grant", link: "https://lab.example.edu/n/1", summary: "We won", date: "Mon, 28 Sep 2026 10:00:00 GMT" }] });
    const atom = parseFeed(`<feed xmlns="http://www.w3.org/2005/Atom"><title>Journal TOC</title>
      <entry><title>Paper A</title><link rel="self" href="https://j.example.org/self"/><link rel="alternate" href="https://j.example.org/a"/><updated>2026-09-30T00:00:00Z</updated><summary>Abs</summary></entry></feed>`);
    expect(atom.entries[0]).toEqual({ title: "Paper A", link: "https://j.example.org/a", summary: "Abs", date: "2026-09-30T00:00:00Z" });
  });
});

describe("HTML extraction", () => {
  it("reads metadata dates, JSON-LD and WeChat timestamps", () => {
    const meta = extractFromHtml(
      `<html lang="en"><head><title>T</title><meta property="article:published_time" content="2026-09-28T09:00:00Z"><meta property="og:site_name" content="Site"></head><body><article><p>${"Body text. ".repeat(40)}</p></article></body></html>`,
      "https://x.example.com/a",
    );
    expect(meta.publishedAt).toBe("2026-09-28T09:00:00.000Z");
    expect(meta.dateSource).toBe("metadata");
    expect(meta.siteName).toBe("Site");
    expect(meta.text).toContain("Body text.");

    const ld = extractFromHtml(
      `<html><head><script type="application/ld+json">{"@graph":[{"@type":"NewsArticle","datePublished":"2026-09-26"}]}</script></head><body>x</body></html>`,
      "https://x.example.com/b",
    );
    expect(ld.publishedAt?.slice(0, 10)).toBe("2026-09-26");

    const wx = extractFromHtml(`<html><body><script>var ct = "1790000000";</script><div id="js_content">文章</div></body></html>`, "https://mp.weixin.qq.com/s?x");
    expect(wx.publishedAt).toBe(new Date(1790000000 * 1000).toISOString());
  });
  it("parses a Google Scholar profile with citation cluster ids", () => {
    const html = `<div id="gsc_prf_in">Jane Doe</div><div class="gsc_prf_il">Example University</div>
      <div id="gsc_prf_int"><a>Lipidomics</a><a>Mass spectrometry</a></div>
      <table><tr class="gsc_a_tr"><td><a class="gsc_a_at">Paper One</a></td><td><a class="gsc_a_ac" href="https://scholar.google.com/scholar?oi=bibs&hl=en&cites=1234,5678">42</a></td><td class="gsc_a_y"><span>2024</span></td></tr>
      <tr class="gsc_a_tr"><td><a class="gsc_a_at">Paper Two</a></td><td><a class="gsc_a_ac"></a></td><td class="gsc_a_y"><span></span></td></tr></table>`;
    expect(parseScholarProfile(html)).toEqual({
      name: "Jane Doe",
      affiliation: "Example University",
      interests: ["Lipidomics", "Mass spectrometry"],
      paperTitles: ["Paper One", "Paper Two"],
      papers: [
        { title: "Paper One", citesId: "1234", citedBy: 42, year: 2024 },
        { title: "Paper Two", citesId: undefined, citedBy: undefined, year: undefined },
      ],
    });
    expect(scholarUserId("https://scholar.google.com/citations?user=AbC-12_x&hl=en")).toBe("AbC-12_x");
  });
});
