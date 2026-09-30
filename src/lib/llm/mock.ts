/**
 * Deterministic offline LLM for MOCK_MODE. It only rearranges text from the context it is
 * given (sample corpus), so pipeline logic, verification and UI can be exercised without a key.
 */
import type { BriefingItem, BriefingSource, Candidate, Category, Cluster } from "../types";
import { splitSentences } from "../pipeline/verify";
import { jaccard, tokenize } from "../util/text";
import type { CompletionRequest, CompletionResult, LLMProvider } from "./types";

function sentences(text: string): string[] {
  return splitSentences(text).filter((s) => s.length > 12);
}

export class MockProvider implements LLMProvider {
  readonly name = "mock";
  readonly model = "mock-editor";

  async complete(req: CompletionRequest): Promise<CompletionResult> {
    const ctx = (req.mockContext ?? {}) as Record<string, unknown>;
    let out: unknown;
    switch (req.purpose) {
      case "profile":
        out = this.profile(ctx.enabled as Category[]);
        break;
      case "cluster":
        out = this.cluster(ctx.candidates as Candidate[], ctx.groups as string[][]);
        break;
      case "synthesize":
        out = this.synthesize(ctx.cluster as Cluster, ctx.sources as BriefingSource[], ctx.members as Candidate[]);
        break;
      case "edition":
        out = this.edition(ctx.items as BriefingItem[]);
        break;
      default:
        out = {};
    }
    await new Promise((r) => setTimeout(r, 120));
    return { text: JSON.stringify(out), model: this.model };
  }

  private profile(enabled: Category[]) {
    const q = (category: Category, query: string, lang: "en" | "zh" = "en") => ({ category, query, lang });
    return {
      summary:
        "Sample persona: an analytical chemist building mass-spectrometry methods for single-cell and spatial lipidomics, with interests in lipid nanoparticles and ML-based spectral annotation.",
      person: { name: "Mira Chen", roles: ["Assistant Professor"], affiliations: ["Example University"], aliases: [], location: "" },
      topics: [
        { name: "Single-cell lipidomics", weight: 1, keywords: ["single-cell lipidomics", "single hepatocytes", "lipidome"], zhKeywords: ["单细胞脂质组学"] },
        { name: "Ion mobility mass spectrometry", weight: 0.9, keywords: ["ion mobility", "trapped ion mobility"] },
        { name: "MALDI imaging", weight: 0.8, keywords: ["MALDI imaging", "spatial lipidomics", "imaging"] },
        { name: "Lipid nanoparticles", weight: 0.6, keywords: ["lipid nanoparticle", "mRNA delivery"] },
        { name: "ML spectral annotation", weight: 0.7, keywords: ["MS/MS spectra", "transformer", "annotation"] },
      ],
      entities: {
        people: ["Daniel Okafor", "Lena Vogel"],
        organizations: ["Example Institute of Technology", "International Lipidomics Society"],
        companies: ["Northwind Biosciences", "Example Instruments", "LipoGenix"],
        venues: ["ASMS"],
        products: ["timsImage"],
      },
      queries: [
        q("paper", "single-cell lipidomics ion mobility"),
        q("paper", "lipid MS/MS spectra annotation transformer"),
        q("news", "spatial lipidomics imaging core"),
        q("funding", "lipid nanoparticle Series B"),
        q("event", "lipidomics society meeting"),
        q("job", "postdoc single-cell mass spectrometry"),
        q("patent", "ion mobility lipid isomers"),
        q("product", "MALDI imaging launch"),
        q("wechat", "单细胞脂质组学", "zh"),
        q("people", "Daniel Okafor"),
        q("other", "spatial omics funding program"),
      ].filter((x) => enabled.includes(x.category)),
      languages: ["en", "zh"],
      exclusions: [],
    };
  }

  /** Groups stories whose lead sentences overlap (a stand-in for the model's semantic grouping). */
  private cluster(candidates: Candidate[], titleGroups: string[][]) {
    const byId = new Map(candidates.map((c) => [c.id, c]));
    const lead = (c: Candidate) => tokenize(`${c.title} ${sentences(c.content ?? c.snippet)[0] ?? ""}`);
    const groups: string[][] = [];
    for (const g of titleGroups) {
      const home = groups.find((h) => jaccard(lead(byId.get(h[0])!), lead(byId.get(g[0])!)) >= 0.25);
      if (home) home.push(...g);
      else groups.push([...g]);
    }
    return {
      clusters: groups.map((ids) => {
        const members = ids.map((id) => byId.get(id)!);
        const best = Math.max(...members.map((m) => m.prescore ?? 0));
        const rel = Math.min(10, Math.round(best * 35) / 10);
        return {
          ids,
          category: members[0].categoryHint ?? "other",
          label: members[0].title,
          relevance: rel,
          impact: 6,
          novelty: 7,
          credibility: 7,
          value: Math.min(10, rel),
          rationale: `Matches the reader's focus (sample scoring from keyword overlap: ${best.toFixed(2)}).`,
        };
      }),
    };
  }

  private synthesize(cluster: Cluster, sources: BriefingSource[], members: Candidate[]) {
    const text = (s: BriefingSource) => members.find((m) => m.url === s.url)?.content ?? "";
    const s1 = sentences(text(sources[0]));
    const facts = sources.flatMap((s) =>
      sentences(text(s))
        .filter((x) => /\d/.test(x))
        .slice(0, 2)
        .map((x) => ({ text: x, sources: [s.id] })),
    );
    return {
      title: members[0].title,
      category: cluster.category,
      summary: `${s1.slice(0, 2).join(" ")} [S1]`,
      whyItMatters: `This connects directly to the reader's work on ${cluster.category === "paper" ? "single-cell methods" : "the lipidomics ecosystem"} [S1].`,
      keyFacts: facts.slice(0, 4),
      analysis: [
        { heading: "What was reported", body: `${s1.slice(0, 3).join(" ")} [S1]` },
        ...(sources[1] ? [{ heading: "Corroboration", body: `${sentences(text(sources[1])).slice(0, 2).join(" ")} [S2]` }] : []),
      ],
      relevanceExplanation: cluster.rationale,
      confidence: sources.length > 1 ? "high" : "medium",
    };
  }

  private edition(items: BriefingItem[]) {
    return {
      headline: "Single-cell lipidomics scales up",
      dek: `Sample edition built from fictional data: ${items
        .slice(0, 3)
        .map((i) => `${i.title} [${i.rank}]`)
        .join("; ")}.`,
      themes: ["Single-cell methods", "Imaging", "Funding"],
    };
  }
}
