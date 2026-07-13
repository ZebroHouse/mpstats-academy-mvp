import type { MapEmbedding, ConciergeMatch } from './types';

export function cosineSim(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export function matchTopK(
  queryVec: number[],
  entries: MapEmbedding[],
  opts: { k: number; threshold: number },
): ConciergeMatch[] {
  return entries
    .map((e) => ({ id: e.id, score: cosineSim(queryVec, e.vec) }))
    .filter((m) => m.score >= opts.threshold)
    .sort((a, b) => b.score - a.score)
    .slice(0, opts.k);
}
