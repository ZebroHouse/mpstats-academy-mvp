import type { JSONContent } from '@tiptap/react';
import type { InteractiveProgressState } from '@mpstats/shared';

export type { InteractiveProgressState };

export type RevealItem =
  | { kind: 'segment'; key: string; blocks: JSONContent[] }
  | { kind: 'gate'; key: string; id: string; label: string; passed: boolean }
  | {
      kind: 'checkpoint';
      key: string;
      id: string;
      options: { id: string; label: string }[];
      chosenOptionId: string | null;
      branch: RevealItem[];
    };

export interface RevealPlan {
  items: RevealItem[];
  complete: boolean;
}

/** True if the doc contains any reveal gate or checkpoint (recursively). */
export function hasInteractiveBlocks(doc: JSONContent | null | undefined): boolean {
  if (!doc) return false;
  const walk = (n: JSONContent): boolean =>
    n.type === 'revealGate' || n.type === 'checkpoint' || (n.content ?? []).some(walk);
  return (doc.content ?? []).some(walk);
}

const INTERACTIVE_TYPES = new Set(['revealGate', 'checkpoint']);

/**
 * Walk a flat block list and produce the ordered list of reveal items the
 * student should currently see, plus whether the (sub-)line is fully revealed.
 * Recurses into the chosen checkpoint branch; an unpassed gate or unanswered
 * checkpoint stops the line (complete = false). Pure — no React, fully testable.
 */
export function buildRevealPlan(
  blocks: JSONContent[],
  state: InteractiveProgressState,
  keyPrefix = '',
): RevealPlan {
  const items: RevealItem[] = [];
  let segment: JSONContent[] = [];

  const flush = (i: number) => {
    if (segment.length) {
      items.push({ kind: 'segment', key: `${keyPrefix}seg${i}`, blocks: segment });
      segment = [];
    }
  };

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const type = block.type ?? '';

    if (!INTERACTIVE_TYPES.has(type)) {
      segment.push(block);
      continue;
    }

    if (type === 'revealGate') {
      flush(i);
      const id = String(block.attrs?.id ?? '');
      const label = String(block.attrs?.buttonLabel ?? 'Читать дальше');
      const passed = state.revealedGateIds.includes(id);
      items.push({ kind: 'gate', key: `${keyPrefix}gate${i}`, id, label, passed });
      if (!passed) return { items, complete: false };
      continue;
    }

    // checkpoint
    flush(i);
    const id = String(block.attrs?.id ?? '');
    const optionNodes = (block.content ?? []).filter((n) => n.type === 'checkpointOption');
    const options = optionNodes.map((o) => ({
      id: String(o.attrs?.id ?? ''),
      label: String(o.attrs?.label ?? ''),
    }));
    const chosenOptionId = state.checkpointChoices[id] ?? null;

    if (!chosenOptionId) {
      items.push({ kind: 'checkpoint', key: `${keyPrefix}cp${i}`, id, options, chosenOptionId: null, branch: [] });
      return { items, complete: false };
    }

    const chosen = optionNodes.find((o) => String(o.attrs?.id ?? '') === chosenOptionId);
    const branchBlocks = (chosen?.content ?? []) as JSONContent[];
    const branchPlan = buildRevealPlan(branchBlocks, state, `${keyPrefix}cp${i}_`);
    items.push({
      kind: 'checkpoint',
      key: `${keyPrefix}cp${i}`,
      id,
      options,
      chosenOptionId,
      branch: branchPlan.items,
    });
    if (!branchPlan.complete) return { items, complete: false };
    continue;
  }

  flush(blocks.length);
  return { items, complete: true };
}
