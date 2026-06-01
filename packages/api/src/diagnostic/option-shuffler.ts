/**
 * shuffleOptions — seeded Fisher-Yates shuffle of a 4-option question.
 *
 * Each StaticQuestion has the correct answer at `options[0]`. At runtime we
 * shuffle so the correct option is not always first, and report the new
 * index of the (originally) correct answer.
 *
 * Pure function — seed is derived from `(sessionSeed, questionId)`, so the
 * same session shows the same shuffle for the same question (idempotent on
 * resume), but different questions in the same session shuffle independently.
 */

import type { StaticQuestion } from './static-deck';

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(str: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export interface ShuffleResult {
  options: string[];
  correctIndex: number;
}

export function shuffleOptions(
  question: Pick<StaticQuestion, 'id' | 'options'>,
  sessionSeed: string,
): ShuffleResult {
  const rng = mulberry32(hashString(`${sessionSeed}::${question.id}`));
  const perm = [0, 1, 2, 3];

  // Fisher-Yates on the index array
  for (let i = perm.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = perm[i]!;
    perm[i] = perm[j]!;
    perm[j] = tmp;
  }

  const shuffled = perm.map((origIdx) => question.options[origIdx]!);
  const correctIndex = perm.indexOf(0);

  return { options: shuffled, correctIndex };
}
