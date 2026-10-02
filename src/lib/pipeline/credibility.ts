import { domainOf } from "../util/url";

/** Coarse prior (0..10) for source credibility by domain. The LLM score is blended with this. */
const TIERS: [RegExp, number, string][] = [
  [/(^|\.)(nature\.com|science\.org|cell\.com|thelancet\.com|nejm\.org|pnas\.org|acs\.org|rsc\.org|wiley\.com|springer\.com|sciencedirect\.com|elsevier\.com|ieee\.org|acm\.org|oup\.com|plos\.org|biorxiv\.org|medrxiv\.org|arxiv\.org|chemrxiv\.org|openreview\.net|aclanthology\.org|jbc\.org|jlr\.org|frontiersin\.org|mdpi\.com|doi\.org)$/, 9, "peer-reviewed or preprint server"],
  [/(^|\.)(reuters\.com|apnews\.com|bloomberg\.com|ft\.com|wsj\.com|nytimes\.com|economist\.com|bbc\.co\.uk|bbc\.com|theguardian\.com|washingtonpost\.com|statnews\.com|fiercebiotech\.com|endpts\.com|techcrunch\.com|theverge\.com|wired\.com|arstechnica\.com|technologyreview\.com|axios\.com|cnbc\.com|caixin\.com|scmp\.com|36kr\.com|thepaper\.cn|xinhuanet\.com|genengnews\.com|biospace\.com|nasdaq\.com|businesswire\.com|prnewswire\.com|globenewswire\.com)$/, 8, "established news or wire"],
  [/(\.gov|\.gov\.cn|\.edu|\.edu\.cn|\.ac\.uk|\.ac\.cn|\.ac\.jp|europa\.eu|who\.int|nih\.gov|nsf\.gov|wipo\.int|patents\.google\.com|uspto\.gov|cnipa\.gov\.cn)$/, 8.5, "official, academic or patent office"],
  [/(^|\.)(semanticscholar\.org|scholar\.google\.com|pubmed\.ncbi\.nlm\.nih\.gov|ncbi\.nlm\.nih\.gov|europepmc\.org)$/, 8.5, "scholarly index"],
  [/(^|\.)(mp\.weixin\.qq\.com)$/, 6, "WeChat official account"],
  [/(^|\.)(linkedin\.com|x\.com|twitter\.com|medium\.com|substack\.com|zhihu\.com|reddit\.com|weibo\.com|youtube\.com)$/, 5, "social or self-published"],
];

export function credibilityPrior(url: string): { score: number; reason: string } {
  const d = domainOf(url);
  for (const [re, score, reason] of TIERS) if (re.test(d)) return { score, reason };
  return { score: 6.5, reason: "general web source" };
}
