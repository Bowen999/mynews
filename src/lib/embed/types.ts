import type { Vector } from "./vector";

export interface Embedder {
  readonly name: string;
  readonly model: string;
  /**
   * Raw cosine values that mean "unrelated" (floor) and "clearly about the same thing" (ceil) for this model.
   * Used to map similarities onto 0..1 relevance.
   */
  readonly calibration: { floor: number; ceil: number; sameStory: number };
  embed(texts: string[]): Promise<Vector[]>;
}
