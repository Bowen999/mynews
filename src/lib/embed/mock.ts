import { tokenize } from "../util/text";
import { normalize, type Vector } from "./vector";
import type { Embedder } from "./types";

const DIMS = 256;

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Deterministic offline embedder for MOCK_MODE and tests: hashed bag of words and word bigrams.
 * Texts that share vocabulary get similar vectors, which is enough to exercise the ranking logic.
 */
export class MockEmbedder implements Embedder {
  readonly name = "mock";
  readonly model = "mock-hash@256";
  readonly calibration = { floor: 0.05, ceil: 0.45, sameStory: 0.6 };

  async embed(texts: string[]): Promise<Vector[]> {
    return texts.map((t) => {
      const v = new Float32Array(DIMS);
      const toks = tokenize(t).map((w) => w.replace(/s$/, ""));
      const feats = [...toks, ...toks.slice(1).map((w, i) => `${toks[i]}_${w}`)];
      for (const f of feats) {
        const h = hash(f);
        v[h % DIMS] += h & 1 ? 1 : -1;
      }
      return normalize(v);
    });
  }
}
