/**
 * FICTIONAL sample data for MOCK_MODE (offline development, tests and UI previews).
 * All people, organizations and URLs are invented and use reserved example.* domains.
 * Never used when MOCK_MODE is off.
 */
import type { Category } from "../types";

export interface MockDoc {
  category: Category;
  title: string;
  publisher: string;
  url: string;
  daysAgo: number;
  content: string;
  authors?: string[];
  venue?: string;
  signals?: string[];
}

export const MOCK_PERSON_DOC = `Dr. Mira Chen (sample persona) — Assistant Professor, Department of Chemistry, Example University.
The Chen Lab develops mass-spectrometry methods for single-cell lipidomics and spatial metabolomics, with applications to lipid metabolism in the liver and neurodegeneration.
Research interests: single-cell lipidomics, MALDI imaging mass spectrometry, ion mobility, lipid nanoparticles for mRNA delivery, machine learning for spectral annotation.
Selected publications: "Single-cell lipid profiling with trapped ion mobility" (2024); "Deep learning annotation of lipid MS/MS spectra" (2023).
Collaborators: Prof. Daniel Okafor (Example Institute of Technology), Dr. Lena Vogel (Northwind Biosciences).
Members of the Lipid Imaging Consortium. Regularly attends ASMS and the International Lipidomics Society meeting.`;

export const MOCK_CORPUS: MockDoc[] = [
  {
    category: "paper",
    title: "Trapped ion mobility enables lipidome maps of 1,200 single hepatocytes",
    publisher: "Journal of Example Chemistry",
    url: "https://journal.example.org/articles/jec-2026-0412",
    daysAgo: 2,
    authors: ["A. Rivera", "D. Okafor", "S. Patel"],
    venue: "Journal of Example Chemistry",
    signals: ["cites-your-work", "coauthor"],
    content:
      "Researchers profiled 1,200 single hepatocytes using trapped ion mobility mass spectrometry and annotated 412 lipid species per cell on average. The method separates isomeric phosphatidylcholines that co-elute in conventional workflows. The authors report a 3.4-fold improvement in coverage over their previous single-cell protocol and release the pipeline as open source. The study builds on earlier single-cell lipid profiling work and was funded by the Example Science Foundation.",
  },
  {
    category: "paper",
    title: "Transformer model annotates lipid MS/MS spectra with 94% top-1 accuracy",
    publisher: "arXiv (sample)",
    url: "https://preprints.example.org/abs/2609.01234",
    daysAgo: 4,
    authors: ["J. Park", "M. Laurent"],
    venue: "Preprint",
    content:
      "A transformer trained on 2.1 million annotated tandem mass spectra achieves 94% top-1 accuracy for lipid class and 81% for exact species on a held-out benchmark. The authors compare against rule-based tools and report the largest gains for oxidized lipids. Code and weights are available under an open license. The preprint has not yet been peer reviewed.",
  },
  {
    category: "news",
    title: "Northwind Biosciences opens spatial lipidomics core with 40 imaging instruments",
    publisher: "Example Science News",
    url: "https://news.example.com/2026/09/northwind-spatial-core",
    daysAgo: 3,
    content:
      "Northwind Biosciences announced a spatial lipidomics core facility housing 40 MALDI imaging instruments. The company said the facility will offer fee-for-service tissue imaging to academic groups starting in November. Dr. Lena Vogel, who leads the effort, said the core will prioritize neurodegeneration studies. The facility is located in the Example City innovation district.",
  },
  {
    category: "news",
    title: "Northwind unveils imaging core aimed at neuroscience labs",
    publisher: "Example Biotech Daily",
    url: "https://biotech.example.net/northwind-imaging-core",
    daysAgo: 3,
    content:
      "Northwind Biosciences is opening a lipid imaging core with 40 instruments, according to the company. Academic access will begin in November, with priority for neurodegeneration projects. Pricing was not disclosed.",
  },
  {
    category: "funding",
    title: "LipoGenix raises $48 million Series B for lipid nanoparticle delivery platform",
    publisher: "Example Venture Wire",
    url: "https://venture.example.com/lipogenix-series-b",
    daysAgo: 1,
    content:
      "LipoGenix, a developer of ionizable lipid nanoparticles for mRNA delivery, raised $48 million in a Series B round led by Example Capital. The company plans to use the funds to advance two liver-targeted programs into clinical trials in 2027. LipoGenix said its lipid library now includes more than 3,000 ionizable lipids screened in vivo.",
  },
  {
    category: "event",
    title: "International Lipidomics Society announces 2027 meeting program and abstract deadline",
    publisher: "International Lipidomics Society (sample)",
    url: "https://lipidsociety.example.org/meeting-2027",
    daysAgo: 5,
    content:
      "The International Lipidomics Society published the program for its 2027 annual meeting, including a new session on single-cell and spatial lipidomics. Abstract submission closes on December 15. Early registration opens in October. The meeting will be held in Example City.",
  },
  {
    category: "job",
    title: "Postdoctoral fellow in single-cell mass spectrometry — Example Institute of Technology",
    publisher: "Example Careers",
    url: "https://careers.example.edu/postdoc-single-cell-ms",
    daysAgo: 2,
    content:
      "The Okafor Lab at the Example Institute of Technology seeks a postdoctoral fellow to develop single-cell mass spectrometry methods. The two-year position starts in January and requires a PhD in analytical chemistry or a related field. Applications are reviewed on a rolling basis.",
  },
  {
    category: "patent",
    title: "Patent application: ion mobility separation of lipid isomers using drift gas modifiers",
    publisher: "Example Patent Office",
    url: "https://patents.example.org/app/US2026-0123456",
    daysAgo: 6,
    content:
      "The published application describes a method for separating lipid isomers by adding a chemical modifier to the drift gas of an ion mobility spectrometer. The applicant is Example Instruments Inc. The application includes 18 claims covering the modifier composition and the calibration procedure.",
  },
  {
    category: "product",
    title: "Example Instruments launches timsImage 2 with 5-micron spatial resolution",
    publisher: "Example Lab Products",
    url: "https://labproducts.example.com/timsimage-2-launch",
    daysAgo: 4,
    content:
      "Example Instruments launched timsImage 2, a MALDI imaging platform with 5-micron spatial resolution and integrated ion mobility. The company said acquisition speed doubled compared with the previous model. Shipments begin in the first quarter.",
  },
  {
    category: "wechat",
    title: "单细胞脂质组学新方法：一次分析上千个细胞",
    publisher: "示例科研公众号",
    url: "https://wechat.example.cn/s/single-cell-lipidomics",
    daysAgo: 2,
    content:
      "文章介绍了一种单细胞脂质组学新方法，研究团队利用离子淌度质谱分析了1200个肝细胞，每个细胞平均鉴定412种脂质。作者认为该方法有望用于肝脏代谢疾病研究。",
  },
  {
    category: "people",
    title: "Daniel Okafor named director of Example Institute's metabolomics center",
    publisher: "Example Institute News",
    url: "https://news.example.edu/okafor-director",
    daysAgo: 5,
    content:
      "The Example Institute of Technology named Prof. Daniel Okafor director of its metabolomics center. Okafor, whose group develops single-cell mass spectrometry, will oversee 12 core staff. The appointment takes effect October 1.",
  },
  {
    category: "other",
    title: "Example Science Foundation opens $20 million program for spatial omics tools",
    publisher: "Example Science Foundation",
    url: "https://foundation.example.gov/spatial-omics-program",
    daysAgo: 3,
    content:
      "The Example Science Foundation opened a $20 million funding program for spatial omics technology development. Awards of up to $1.5 million over three years are available. Letters of intent are due November 30.",
  },
  {
    category: "news",
    title: "Celebrity chef shares favorite olive oil brands",
    publisher: "Example Lifestyle",
    url: "https://lifestyle.example.com/olive-oil",
    daysAgo: 2,
    content: "A celebrity chef listed five olive oil brands. The article discusses taste and price.",
  },
];

export function mockSourceDocument(url: string): { title: string; text: string } {
  return { title: `Sample source for ${url}`, text: MOCK_PERSON_DOC };
}
