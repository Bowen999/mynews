import { sleep } from "../util/concurrency";
import { LLMError, type CompletionRequest, type CompletionResult, type LLMProvider } from "./types";

export interface OpenAICompatibleOptions {
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  /** Provider-specific body fields merged into every request. */
  extraBody?: Record<string, unknown>;
  maxRetries?: number;
}

interface ChatCompletionResponse {
  model?: string;
  choices?: { message?: { content?: string | null }; finish_reason?: string }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  error?: { message?: string };
}

/** Works with any OpenAI-compatible /chat/completions endpoint (DeepSeek, OpenAI, Together, vLLM…). */
export class OpenAICompatibleProvider implements LLMProvider {
  readonly name: string;
  readonly model: string;
  private readonly opts: OpenAICompatibleOptions;

  constructor(opts: OpenAICompatibleOptions) {
    this.opts = opts;
    this.name = opts.name;
    this.model = opts.model;
  }

  async complete(req: CompletionRequest): Promise<CompletionResult> {
    const body: Record<string, unknown> = {
      model: this.model,
      messages: req.messages,
      temperature: req.temperature ?? 0.3,
      max_tokens: req.maxTokens ?? 4000,
      stream: false,
      ...this.opts.extraBody,
    };
    if (req.json) body.response_format = { type: "json_object" };

    const url = `${this.opts.baseUrl.replace(/\/+$/, "")}/chat/completions`;
    const maxRetries = this.opts.maxRetries ?? 2;
    let lastError: LLMError | undefined;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      if (attempt > 0) await sleep(1500 * 2 ** (attempt - 1));
      const left = req.deadlineAt ? req.deadlineAt - Date.now() : Infinity;
      if (left < 8000) {
        lastError ??= new LLMError(`${this.name} request skipped: not enough time left in this step`, undefined, true);
        break;
      }
      const timeout = Math.min(req.timeoutMs ?? 150_000, left);
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.opts.apiKey}`,
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(timeout),
        });
        const raw = await res.text();
        let data: ChatCompletionResponse | undefined;
        try {
          data = JSON.parse(raw) as ChatCompletionResponse;
        } catch {
          data = undefined;
        }
        if (!res.ok) {
          const msg = data?.error?.message ?? raw.slice(0, 300);
          const retryable = res.status === 429 || res.status >= 500;
          lastError = new LLMError(`${this.name} API ${res.status}: ${msg}`, res.status, retryable);
          if (res.status === 401 || res.status === 403) {
            throw new LLMError(`${this.name} rejected the API key (HTTP ${res.status}). Check the key and account balance.`, res.status);
          }
          if (res.status === 402) {
            throw new LLMError(`${this.name} reports insufficient balance (HTTP 402). Top up the account.`, res.status);
          }
          if (retryable) continue;
          throw lastError;
        }
        const text = data?.choices?.[0]?.message?.content ?? "";
        if (!text.trim()) {
          lastError = new LLMError(`${this.name} returned an empty response`, res.status, true);
          continue;
        }
        return {
          text,
          model: data?.model ?? this.model,
          usage: { promptTokens: data?.usage?.prompt_tokens, completionTokens: data?.usage?.completion_tokens },
        };
      } catch (e) {
        if (e instanceof LLMError && !e.retryable) throw e;
        const msg = e instanceof Error ? e.message : String(e);
        lastError = e instanceof LLMError ? e : new LLMError(`${this.name} request failed: ${msg}`, undefined, true);
      }
    }
    throw lastError ?? new LLMError(`${this.name} request failed`);
  }
}
