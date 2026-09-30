import { describe, expect, it } from "vitest";
import { extractFromHtml, parseScholarProfile } from "../src/lib/extract/html";
import { buildArxivQuery, parseArxivFeed } from "../src/lib/search/arxiv";
import { invertAbstract, normalizeWork } from "../src/lib/search/openalex";
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

describe("OpenAlex", () => {
  it("rebuilds abstracts and normalizes works", () => {
    expect(invertAbstract({ world: [1], hello: [0] })).toBe("hello world");
    const r = normalizeWork(
      {
        id: "https://openalex.org/W1",
        doi: "https://doi.org/10.1/ABC",
        display_name: "Paper",
        publication_date: "2026-09-25",
        primary_location: { source: { display_name: "Journal X" } },
        authorships: [{ author: { display_name: "A" } }],
        abstract_inverted_index: { Hi: [0] },
      },
      "openalex",
      "cites-your-work",
    );
    expect(r).toMatchObject({ url: "https://doi.org/10.1/ABC", doi: "10.1/abc", venue: "Journal X", signals: ["cites-your-work"], dateSource: "metadata" });
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
  it("parses a Google Scholar profile", () => {
    const html = `<div id="gsc_prf_in">Jane Doe</div><div class="gsc_prf_il">Example University</div>
      <div id="gsc_prf_int"><a>Lipidomics</a><a>Mass spectrometry</a></div><a class="gsc_a_at">Paper One</a>`;
    expect(parseScholarProfile(html)).toEqual({
      name: "Jane Doe",
      affiliation: "Example University",
      interests: ["Lipidomics", "Mass spectrometry"],
      paperTitles: ["Paper One"],
    });
  });
});
