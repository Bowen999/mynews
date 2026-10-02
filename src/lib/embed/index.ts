import { config } from "../config";
import { JinaEmbedder } from "./jina";
import { MockEmbedder } from "./mock";
import type { Embedder } from "./types";

export type { Embedder } from "./types";
export * from "./vector";

/** The configured embedder, or null when semantic ranking is off (no JINA_API_KEY). */
export function getEmbedder(): Embedder | null {
  if (config.mockMode) return new MockEmbedder();
  if (config.embed.disabled || !config.search.jinaKey) return null;
  return new JinaEmbedder({ apiKey: config.search.jinaKey, model: config.embed.model, dims: config.embed.dims });
}

/** Map a raw cosine onto 0..1 using the embedder's calibration. */
export function relevanceFromCosine(e: Embedder, cos: number): number {
  const { floor, ceil } = e.calibration;
  return Math.max(0, Math.min(1, (cos - floor) / (ceil - floor)));
}

export function describeEmbedder(): string {
  if (config.mockMode) return "Mock embeddings (MOCK_MODE)";
  if (config.embed.disabled) return "Off (EMBEDDINGS_DISABLED=1): keyword matching only";
  if (!config.search.jinaKey) return "Off (no JINA_API_KEY): keyword matching only";
  return `Jina · ${config.embed.model} (${config.embed.dims}-d)`;
}
