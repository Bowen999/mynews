import { OpenAICompatibleProvider } from "./openai-compatible";

export interface DeepSeekOptions {
  apiKey: string;
  baseUrl?: string;
  model?: string;
  thinking?: "enabled" | "disabled";
}

/**
 * DeepSeek chat completions (OpenAI-compatible). V4 models take thinking mode as a request
 * parameter; it defaults to disabled here because the pipeline needs fast, structured JSON.
 */
export class DeepSeekProvider extends OpenAICompatibleProvider {
  constructor(opts: DeepSeekOptions) {
    super({
      name: "deepseek",
      baseUrl: opts.baseUrl ?? "https://api.deepseek.com",
      apiKey: opts.apiKey,
      model: opts.model ?? "deepseek-v4-flash",
      extraBody: { thinking: { type: opts.thinking ?? "disabled" } },
    });
  }
}
