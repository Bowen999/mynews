import { config, configurationAdvisories, configurationProblems, webSearchProviders } from "./config";
import { describeEmbedder } from "./embed";
import { getStore } from "./store";
import type { SystemStatus } from "./types";

export function systemStatus(): SystemStatus {
  const llm = config.mockMode
    ? "Mock provider (MOCK_MODE)"
    : config.llm.provider === "deepseek"
      ? `DeepSeek · ${config.llm.deepseek.model}${config.llm.deepseek.thinking === "enabled" ? " (thinking)" : ""}${config.llm.deepseek.apiKey ? "" : " — key missing"}`
      : `${config.llm.provider} · ${process.env.LLM_MODEL ?? ""}`;
  return {
    llm,
    search: webSearchProviders(),
    scholarly: [
      "Semantic Scholar" + (config.search.semanticScholarKey ? "" : " (shared keyless limit)"),
      "Europe PMC",
      "arXiv",
      config.search.googleScholar ? "Google Scholar via Jina Reader" + (config.search.jinaKey ? "" : " (keyless, slow)") : "Google Scholar off",
    ],
    embeddings: describeEmbedder(),
    storage: getStore().kind,
    ntfyTopic: config.notify.disabled ? "Disabled" : config.notify.topicUrl,
    advisories: configurationAdvisories(),
    problems: configurationProblems(),
  };
}
