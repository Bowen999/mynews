import { describe, expect, it } from "vitest";
import { extractJson } from "../src/lib/llm/json";
import { inWindow, parseDate, previousWeekWindow } from "../src/lib/util/dates";
import { titleSimilarity, tokenize } from "../src/lib/util/text";
import { canonicalizeUrl, domainOf, isGitHub, normalizeUserUrl } from "../src/lib/util/url";

describe("canonicalizeUrl", () => {
  it("removes tracking params, www and trailing slashes", () => {
    expect(canonicalizeUrl("https://www.Example.com/a/b/?utm_source=x&id=3&fbclid=y#frag")).toBe("https://example.com/a/b?id=3");
  });
  it("collapses arXiv versions and pdf links", () => {
    expect(canonicalizeUrl("http://arxiv.org/pdf/2409.01234v3.pdf")).toBe("https://arxiv.org/abs/2409.01234");
    expect(canonicalizeUrl("https://arxiv.org/abs/2409.01234v1")).toBe("https://arxiv.org/abs/2409.01234");
  });
  it("keeps only identifying WeChat params", () => {
    expect(canonicalizeUrl("https://mp.weixin.qq.com/s?__biz=AB&mid=1&idx=1&sn=zz&chksm=abc&scene=21")).toBe(
      "https://mp.weixin.qq.com/s?__biz=AB&mid=1&idx=1&sn=zz",
    );
  });
  it("lowercases DOIs", () => {
    expect(canonicalizeUrl("https://doi.org/10.1038/S41586-024-0001")).toBe("https://doi.org/10.1038/s41586-024-0001");
  });
});

describe("url helpers", () => {
  it("detects GitHub", () => {
    expect(isGitHub("https://github.com/org/repo")).toBe(true);
    expect(isGitHub("https://org.github.io/page")).toBe(true);
    expect(isGitHub("https://gitlab.com/x")).toBe(false);
  });
  it("normalizes user input", () => {
    expect(normalizeUserUrl("scholar.google.com/citations?user=abc")).toBe("https://scholar.google.com/citations?user=abc");
    expect(normalizeUserUrl("not a url")).toBeNull();
    expect(domainOf("https://www.nature.com/x")).toBe("nature.com");
  });
});

describe("dates", () => {
  const now = new Date("2026-09-30T12:00:00Z");
  const w = previousWeekWindow(now);
  it("parses assorted formats", () => {
    expect(parseDate("2026-09-28")?.toISOString()).toBe("2026-09-28T12:00:00.000Z");
    expect(parseDate("Mon, 28 Sep 2026 08:00:00 GMT")?.toISOString()).toBe("2026-09-28T08:00:00.000Z");
    expect(parseDate("2 days ago", now)?.toISOString()).toBe("2026-09-28T12:00:00.000Z");
    expect(parseDate("2026年9月27日")?.toISOString()).toBe("2026-09-27T12:00:00.000Z");
    expect(parseDate("garbage")).toBeUndefined();
  });
  it("checks the 7-day window with day tolerance", () => {
    expect(inWindow(new Date("2026-09-24T12:00:00Z"), w)).toBe(true);
    expect(inWindow(new Date("2026-09-20T00:00:00Z"), w)).toBe(false);
    expect(inWindow(undefined, w)).toBe(false);
  });
});

describe("text", () => {
  it("tokenizes Latin words and CJK bigrams", () => {
    expect(tokenize("Single-cell lipidomics of the liver")).toEqual(["single-cell", "lipidomics", "liver"]);
    expect(tokenize("单细胞脂质")).toEqual(["单细", "细胞", "胞脂", "脂质"]);
  });
  it("scores near-duplicate headlines as similar", () => {
    expect(titleSimilarity("Northwind opens spatial lipidomics core - Example News", "Northwind opens spatial lipidomics core")).toBe(1);
    expect(titleSimilarity("Apples and oranges", "Mass spectrometry imaging")).toBe(0);
  });
});

describe("extractJson", () => {
  it("handles fences, preambles and trailing commas", () => {
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(extractJson('Sure! {"a":[1,2,],}')).toEqual({ a: [1, 2] });
  });
});
