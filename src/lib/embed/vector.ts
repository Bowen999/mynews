/** Small vector helpers. Vectors are unit-normalized Float32Arrays; stored as int8 base64. */

export type Vector = Float32Array;

export function normalize(v: Vector): Vector {
  let n = 0;
  for (const x of v) n += x * x;
  n = Math.sqrt(n);
  if (!n) return v;
  const out = new Float32Array(v.length);
  for (let i = 0; i < v.length; i++) out[i] = v[i] / n;
  return out;
}

/** Cosine similarity (dot product of unit vectors). */
export function cosine(a: Vector, b: Vector): number {
  const n = Math.min(a.length, b.length);
  let s = 0;
  for (let i = 0; i < n; i++) s += a[i] * b[i];
  return s;
}

export function mean(vectors: Vector[], weights?: number[]): Vector | null {
  if (!vectors.length) return null;
  const out = new Float32Array(vectors[0].length);
  vectors.forEach((v, j) => {
    const w = weights?.[j] ?? 1;
    for (let i = 0; i < out.length; i++) out[i] += v[i] * w;
  });
  return normalize(out);
}

/** Quantize a unit vector to int8 and base64-encode it (~4× smaller than JSON floats). */
export function encodeVector(v: Vector): string {
  const bytes = new Int8Array(v.length);
  for (let i = 0; i < v.length; i++) bytes[i] = Math.max(-127, Math.min(127, Math.round(v[i] * 127)));
  return Buffer.from(bytes.buffer).toString("base64");
}

export function decodeVector(s: string | undefined | null): Vector | null {
  if (!s) return null;
  try {
    const buf = Buffer.from(s, "base64");
    const bytes = new Int8Array(buf.buffer, buf.byteOffset, buf.byteLength);
    const v = new Float32Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) v[i] = bytes[i] / 127;
    return bytes.length ? normalize(v) : null;
  } catch {
    return null;
  }
}

/** Highest similarity between `v` and any vector in `others`, with its index. */
export function maxSimilarity(v: Vector, others: Vector[]): { sim: number; index: number } {
  let best = -1;
  let index = -1;
  others.forEach((o, i) => {
    const s = cosine(v, o);
    if (s > best) {
      best = s;
      index = i;
    }
  });
  return { sim: best, index };
}
