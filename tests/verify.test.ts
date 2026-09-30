import { describe, expect, it } from "vitest";
import { validateCover } from "../src/lib/pipeline/publish";
import { citedIds, ClaimVerifier, claimNumbers, cleanMarkers, splitSentences } from "../src/lib/pipeline/verify";
import type { BriefingItem } from "../src/lib/types";

const texts = new Map([
  ["S1", "LipoGenix raised $48 million in a Series B round. The library includes more than 3,000 lipids."],
  ["S2", "The company plans trials in 2027."],
]);

describe("citation markers", () => {
  it("parses and normalizes markers", () => {
    expect(citedIds("A [S1, S2] b [S3]")).toEqual(["S1", "S2", "S3"]);
    expect(cleanMarkers("A claim [S1, S9] .", new Set(["S1"]))).toBe("A claim [S1].");
  });
  it("splits sentences keeping trailing citations", () => {
    expect(splitSentences("One fact. [S1] Two facts! [S2][S3] Three")).toEqual(["One fact. [S1]", "Two facts! [S2][S3]", "Three"]);
    expect(splitSentences("Up 3.5 percent per Dr. Smith of the U.S. team. Next")).toEqual(["Up 3.5 percent per Dr. Smith of the U.S. team.", "Next"]);
    expect(splitSentences("第一句。[S1]第二句！")).toEqual(["第一句。[S1]", "第二句！"]);
  });
});

describe("claimNumbers", () => {
  it("keeps amounts, years and large numbers; skips identifiers and small counts", () => {
    expect(claimNumbers("It raised $48 million, up 12.5% since 2025 [S1].")).toEqual(["48", "12.5", "2025"]);
    expect(claimNumbers("GPT-4 and COVID-19 with 3 partners")).toEqual([]);
    expect(claimNumbers("screened 3,000 lipids")).toEqual(["3000"]);
    expect(claimNumbers("costs $5 each")).toEqual(["5"]);
  });
});

describe("ClaimVerifier", () => {
  it("removes sentences with numbers absent from cited sources", () => {
    const v = new ClaimVerifier(texts);
    const out = v.cleanProse("LipoGenix raised $48 million [S1]. It is valued at $900 million [S1].", { requireCitation: true, label: "x" });
    expect(out).toBe("LipoGenix raised $48 million [S1].");
    expect(v.report.removed).toBe(1);
  });
  it("checks numbers against the specific cited source", () => {
    const v = new ClaimVerifier(texts);
    expect(v.cleanProse("Trials are planned for 2027 [S1].", { requireCitation: true, label: "x" })).toBe("");
    expect(v.cleanProse("Trials are planned for 2027 [S2].", { requireCitation: true, label: "x" })).toBe("Trials are planned for 2027 [S2].");
  });
  it("drops uncited paragraphs when citations are required", () => {
    const v = new ClaimVerifier(texts);
    expect(v.cleanProse("An unsupported opinion.", { requireCitation: true, label: "x" })).toBe("");
    expect(v.cleanProse("An interpretation without numbers.", { requireCitation: false, label: "x" })).toBe("An interpretation without numbers.");
  });
  it("validates key facts", () => {
    const v = new ClaimVerifier(texts);
    expect(v.cleanFact({ text: "Series B of $48 million", sources: ["S1"] })).toEqual({ text: "Series B of $48 million", sources: ["S1"] });
    expect(v.cleanFact({ text: "Series B of $48 million", sources: ["S7"] })).toBeNull();
    expect(v.cleanFact({ text: "More than 3,000 lipids screened [S1]", sources: [] })).toEqual({ text: "More than 3,000 lipids screened", sources: ["S1"] });
    expect(v.cleanFact({ text: "4,500 lipids", sources: ["S1"] })).toBeNull();
  });
  it("rejects headlines with invented numbers", () => {
    const v = new ClaimVerifier(texts);
    expect(v.titleOk("LipoGenix raises $48M")).toBe(true);
    expect(v.titleOk("LipoGenix raises $60M")).toBe(false);
  });
});

describe("validateCover", () => {
  const item = { title: "LipoGenix raises $48 million", summary: "x [S1]", whyItMatters: "", keyFacts: [], sources: [] } as unknown as BriefingItem;
  it("strips out-of-range item references and rejects unsupported numbers", () => {
    expect(validateCover({ headline: "A $48 million week", dek: "See [1] and [7].", themes: ["a"] }, [item])).toEqual({
      headline: "A $48 million week",
      dek: "See [1] and .",
      themes: ["a"],
    });
    expect(validateCover({ headline: "A $99 million week", dek: "", themes: [] }, [item])).toBeNull();
  });
});
