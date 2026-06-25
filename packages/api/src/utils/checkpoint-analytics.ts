/**
 * Pure analytics over interactive-lesson TipTap docs (Phase C, checkpoint dashboard).
 *
 * Walks a `Lesson.body` document and tallies student checkpoint choices into
 * per-checkpoint distributions. No Prisma, no React, no I/O — fully testable.
 *
 * Node shape (TipTap): `{ type, attrs, content }`.
 *   - `checkpoint`       — attrs `{ id }`; children are `checkpointOption` nodes.
 *   - `checkpointOption` — attrs `{ id, label }`.
 * Mirrors the authoring node defs in
 * `apps/web/src/components/admin/lesson-editor/interactive-nodes.ts`, but this
 * file lives in packages/api and is intentionally self-contained.
 */

const CONTEXT_LABEL_MAX = 80;

interface DocNode {
  type?: string;
  attrs?: Record<string, unknown>;
  content?: unknown[];
  text?: string;
}

export interface CheckpointSpec {
  checkpointId: string;
  contextLabel: string;
  options: { optionId: string; label: string }[];
}

export interface CheckpointDistribution {
  checkpointId: string;
  contextLabel: string;
  totalAnswered: number;
  options: { optionId: string; label: string; count: number; percent: number }[];
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asNode(value: unknown): DocNode | null {
  return isObject(value) ? (value as DocNode) : null;
}

/** Concatenated plain text of a node's direct + nested text children. */
function nodeText(node: DocNode): string {
  if (typeof node.text === 'string') return node.text;
  if (!Array.isArray(node.content)) return '';
  return node.content
    .map((child) => {
      const c = asNode(child);
      return c ? nodeText(c) : '';
    })
    .join('');
}

function truncateLabel(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.length <= CONTEXT_LABEL_MAX) return trimmed;
  return `${trimmed.slice(0, CONTEXT_LABEL_MAX)}…`;
}

function optionsOf(checkpoint: DocNode): { optionId: string; label: string }[] {
  if (!Array.isArray(checkpoint.content)) return [];
  return checkpoint.content
    .map(asNode)
    .filter((n): n is DocNode => n?.type === 'checkpointOption')
    .map((o) => ({
      optionId: String(o.attrs?.id ?? ''),
      label: String(o.attrs?.label ?? ''),
    }));
}

export function extractCheckpoints(body: unknown): CheckpointSpec[] {
  const root = asNode(body);
  if (!root || !Array.isArray(root.content)) return [];

  const result: CheckpointSpec[] = [];
  let lastText = '';

  const walk = (nodes: unknown[]): void => {
    for (const raw of nodes) {
      const node = asNode(raw);
      if (!node) continue;

      if (node.type === 'checkpoint') {
        const checkpointId = String(node.attrs?.id ?? '');
        if (checkpointId) {
          const contextLabel = lastText
            ? truncateLabel(lastText)
            : `Чекпоинт ${result.length + 1}`;
          result.push({ checkpointId, contextLabel, options: optionsOf(node) });
        }
        // Recurse into options/branches; reset context inside the branch.
        if (Array.isArray(node.content)) {
          const outerText = lastText;
          lastText = '';
          walk(node.content);
          lastText = outerText;
        }
        continue;
      }

      if (node.type === 'heading' || node.type === 'paragraph') {
        const t = nodeText(node).trim();
        if (t) lastText = t;
      }

      if (Array.isArray(node.content)) walk(node.content);
    }
  };

  walk(root.content);
  return result;
}

export function tallyCheckpoints(
  body: unknown,
  choiceMaps: Record<string, string>[],
): CheckpointDistribution[] {
  const checkpoints = extractCheckpoints(body);
  const validMaps = Array.isArray(choiceMaps) ? choiceMaps.filter(isObject) : [];

  return checkpoints.map((cp) => {
    const knownIds = new Set(cp.options.map((o) => o.optionId));

    // Collect chosen values for this checkpoint (non-empty strings only).
    const chosen: string[] = [];
    for (const map of validMaps) {
      const value = map[cp.checkpointId];
      if (typeof value === 'string' && value !== '') chosen.push(value);
    }
    const totalAnswered = chosen.length;

    const pct = (count: number): number =>
      totalAnswered === 0 ? 0 : Math.round((count / totalAnswered) * 100);

    const options = cp.options.map((o) => {
      const count = chosen.filter((v) => v === o.optionId).length;
      return { optionId: o.optionId, label: o.label, count, percent: pct(count) };
    });

    // Synthetic buckets for chosen values not in the current body options.
    const unknownCounts = new Map<string, number>();
    for (const value of chosen) {
      if (!knownIds.has(value)) {
        unknownCounts.set(value, (unknownCounts.get(value) ?? 0) + 1);
      }
    }
    for (const [optionId, count] of unknownCounts) {
      options.push({ optionId, label: '(удалённый вариант)', count, percent: pct(count) });
    }

    return {
      checkpointId: cp.checkpointId,
      contextLabel: cp.contextLabel,
      totalAnswered,
      options,
    };
  });
}
