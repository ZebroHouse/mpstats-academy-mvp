/**
 * pickDeckForUser — selects 15 diagnostic questions for a session.
 *
 * WB-only user → all 15 WB questions.
 * Ozon-only user → all 15 Ozon questions.
 * BOTH (or empty → BOTH) → seeded deterministic balanced mix:
 *   - exactly one question per (axis, level) of the 5×3 matrix
 *   - marketplace split 7-8 or 8-7
 *
 * Pure function — no I/O, no Date.now(), no Math.random().
 */

import { STATIC_DECK, type StaticQuestion } from './static-deck';
import { computeEffectiveMarketplaces } from '../utils/job-matcher';

type Axis = StaticQuestion['axis'];
type Level = StaticQuestion['level'];

const AXES_SORTED: Axis[] = (
  ['ANALYTICS', 'CONTENT', 'FINANCE', 'MARKETING', 'OPERATIONS'] as Axis[]
).sort();
const LEVELS: Level[] = [1, 2, 3];

// Mulberry32 — well-known 4-line seeded PRNG.
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

// Simple deterministic string → 32-bit int hash (xfnv1a-ish).
function hashString(str: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function sortByAxisLevel(qs: StaticQuestion[]): StaticQuestion[] {
  return [...qs].sort((a, b) => {
    if (a.axis !== b.axis) return a.axis.localeCompare(b.axis);
    return a.level - b.level;
  });
}

function buildIndex(deck: StaticQuestion[]): Map<string, StaticQuestion> {
  const map = new Map<string, StaticQuestion>();
  for (const q of deck) {
    map.set(`${q.axis}::${q.level}`, q);
  }
  return map;
}

export function pickDeckForUser(
  userMarketplaces: string[],
  sessionSeed: string,
): StaticQuestion[] {
  const effective = computeEffectiveMarketplaces(userMarketplaces);

  if (effective.length === 1) {
    const deck = effective[0] === 'WB' ? STATIC_DECK.wb : STATIC_DECK.ozon;
    return sortByAxisLevel(deck);
  }

  // BOTH path — balanced mix
  const wbIndex = buildIndex(STATIC_DECK.wb);
  const ozIndex = buildIndex(STATIC_DECK.ozon);
  const rng = mulberry32(hashString(sessionSeed));

  type Slot = { axis: Axis; level: Level; pick: 'WB' | 'OZON' };
  const slots: Slot[] = [];

  for (const axis of AXES_SORTED) {
    for (const level of LEVELS) {
      const bit = rng() < 0.5 ? 'WB' : 'OZON';
      slots.push({ axis, level, pick: bit });
    }
  }

  // Re-balance to 7-8 or 8-7 if greedy roll diverged further
  // 15 slots total → target counts are exactly {7, 8} in either order.
  let wbCount = slots.filter((s) => s.pick === 'WB').length;
  // Flip slots one at a time deterministically until split is in {7, 8}.
  // Walk slot indices in a deterministic shuffled order driven by the same RNG.
  const order = slots.map((_, i) => i);
  // Fisher-Yates shuffle for deterministic flip order
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = order[i]!;
    order[i] = order[j]!;
    order[j] = tmp;
  }

  let cursor = 0;
  while ((wbCount < 7 || wbCount > 8) && cursor < order.length) {
    const idx = order[cursor]!;
    const slot = slots[idx]!;
    if (wbCount > 8 && slot.pick === 'WB') {
      slot.pick = 'OZON';
      wbCount--;
    } else if (wbCount < 7 && slot.pick === 'OZON') {
      slot.pick = 'WB';
      wbCount++;
    }
    cursor++;
  }

  const picked: StaticQuestion[] = slots.map((s) => {
    const idx = s.pick === 'WB' ? wbIndex : ozIndex;
    const q = idx.get(`${s.axis}::${s.level}`);
    if (!q) {
      throw new Error(
        `pickDeckForUser: missing question for ${s.axis}/${s.level} in ${s.pick} deck`,
      );
    }
    return q;
  });

  return sortByAxisLevel(picked);
}
