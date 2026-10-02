import { normalize, type Vector } from "./vector";
import type { Embedder } from "./types";

const BATCH = 128;
const MAX_CHARS = 2000;

interface JinaEmbeddingResponse {
  data?: { index: number; embedding: number[] }[];
  usage?: { total_tokens?: number };
  detail?: string;
}

/**
 * Jina Embeddings API (jina-embeddings-v3 by default). Uses the symmetric "text-matching" task so one
 * vector per text serves relevance, clustering, novelty and diversity alike.
 */
export class JinaEmbedder implements Embedder {
  readonly name = "jina";
  readonly calibration = { floor: 0.3, ceil: 0.75, sameStory: 0.9 };
  tokens = 0;

  constructor(
    private readonly opts: { apiKey: string; model: string; dims: number; baseUrl?: string; timeoutMs?: number },
  ) {}

  get model() {
    return `${this.opts.model}@${this.opts.dims}`;
  }

  async embed(texts: string[]): Promise<Vector[]> {
    const out: Vector[] = [];
    for (let i = 0; i < texts.length; i += BATCH) {
      out.push(...(await this.batch(texts.slice(i, i + BATCH))));
    }
    return out;
  }

  private async batch(texts: string[]): Promise<Vector[]> {
    const input = texts.map((t) => (t.trim() || "(empty)").slice(0, MAX_CHARS));
    const res = await fetch(`${this.opts.baseUrl ?? "https://api.jina.ai"}/v1/embeddings`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${this.opts.apiKey}` },
      body: JSON.stringify({
        model: this.opts.model,
        task: "text-matching",
        dimensions: this.opts.dims,
        normalized: true,
        embedding_type: "float",
        truncate: true,
        input,
      }),
      signal: AbortSignal.timeout(this.opts.timeoutMs ?? 30000),
    });
    const text = await res.text();
    if (!res.ok) {
      const hint = res.status === 401 || res.status === 403 ? " (check JINA_API_KEY)" : res.status === 402 ? " (Jina token balance exhausted)" : "";
      throw new Error(`Jina embeddings HTTP ${res.status}${hint}: ${text.slice(0, 160)}`);
    }
    const json = JSON.parse(text) as JinaEmbeddingResponse;
    this.tokens += json.usage?.total_tokens ?? 0;
    const data = [...(json.data ?? [])].sort((a, b) => a.index - b.index);
    if (data.length !== input.length) throw new Error(`Jina embeddings returned ${data.length} vectors for ${input.length} inputs`);
    return data.map((d) => normalize(Float32Array.from(d.embedding)));
  }
}
