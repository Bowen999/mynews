export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export type LLMPurpose = "profile" | "cluster" | "synthesize" | "edition" | "generic";

export interface CompletionRequest {
  messages: ChatMessage[];
  /** Ask the provider for a JSON object response. */
  json?: boolean;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  /** Absolute epoch-ms time by which the call (including retries) must finish. */
  deadlineAt?: number;
  /** Used for logging and by the offline mock provider. */
  purpose?: LLMPurpose;
  /** Structured context for the offline mock provider; ignored by real providers. */
  mockContext?: unknown;
}

export interface CompletionResult {
  text: string;
  model: string;
  usage?: { promptTokens?: number; completionTokens?: number };
}

/**
 * Replaceable LLM provider abstraction. Implementations only need to turn chat messages into
 * text; JSON parsing, validation and retries live in `json.ts`.
 */
export interface LLMProvider {
  readonly name: string;
  readonly model: string;
  complete(req: CompletionRequest): Promise<CompletionResult>;
}

export class LLMError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly retryable = false,
  ) {
    super(message);
    this.name = "LLMError";
  }
}
