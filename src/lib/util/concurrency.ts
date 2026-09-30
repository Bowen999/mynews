/** Map with bounded concurrency; failures are returned as undefined results via onError. */
export async function pMap<T, R>(
  items: readonly T[],
  fn: (item: T, index: number) => Promise<R>,
  concurrency: number,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

export async function settle<T>(p: Promise<T>): Promise<{ ok: true; value: T } | { ok: false; error: Error }> {
  try {
    return { ok: true, value: await p };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e : new Error(String(e)) };
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Tracks a soft time budget for a single serverless invocation. */
export class Deadline {
  private readonly endsAt: number;
  constructor(ms: number) {
    this.endsAt = Date.now() + ms;
  }
  /** Absolute epoch-ms deadline, minus an optional safety margin. */
  at(marginMs = 0): number {
    return this.endsAt - marginMs;
  }
  remaining(): number {
    return this.endsAt - Date.now();
  }
  expired(marginMs = 0): boolean {
    return this.remaining() <= marginMs;
  }
}
