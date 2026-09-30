import { config } from "../config";
import { DeepSeekProvider } from "./deepseek";
import { MockProvider } from "./mock";
import { OpenAICompatibleProvider } from "./openai-compatible";
import type { LLMProvider } from "./types";

export type { LLMProvider } from "./types";

/**
 * Resolve the configured LLM provider. To add a provider, implement `LLMProvider` and register
 * it here; the pipeline only depends on the interface.
 */
export function getLLM(): LLMProvider {
  if (config.mockMode) return new MockProvider();
  const provider = config.llm.provider;
  if (provider === "deepseek") {
    const apiKey = config.llm.deepseek.apiKey;
    if (!apiKey) throw new Error("DEEPSEEK_API_KEY is not set");
    return new DeepSeekProvider({
      apiKey,
      baseUrl: config.llm.deepseek.baseUrl,
      model: config.llm.deepseek.model,
      thinking: config.llm.deepseek.thinking,
    });
  }
  if (provider === "openai-compatible") {
    const apiKey = process.env.LLM_API_KEY;
    const baseUrl = process.env.LLM_BASE_URL;
    const model = process.env.LLM_MODEL;
    if (!apiKey || !baseUrl || !model) throw new Error("LLM_API_KEY, LLM_BASE_URL and LLM_MODEL are required for openai-compatible");
    return new OpenAICompatibleProvider({ name: "openai-compatible", apiKey, baseUrl, model });
  }
  throw new Error(`Unknown LLM_PROVIDER "${provider}"`);
}
