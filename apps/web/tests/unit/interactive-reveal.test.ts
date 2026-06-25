import { describe, it, expect } from 'vitest';
import { buildRevealPlan, hasInteractiveBlocks, type InteractiveProgressState } from '@/components/learning/interactive-reveal';

const empty: InteractiveProgressState = { version: 1, revealedGateIds: [], checkpointChoices: {} };
const p = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] });
const gate = (id: string) => ({ type: 'revealGate', attrs: { id, buttonLabel: 'Дальше' } });
const checkpoint = (id: string, opts: [string, string][]) => ({
  type: 'checkpoint',
  attrs: { id },
  content: opts.map(([oid, label]) => ({
    type: 'checkpointOption',
    attrs: { id: oid, label },
    content: [p(`branch ${oid}`)],
  })),
});

describe('buildRevealPlan', () => {
  it('a plain doc with no gates is complete and one segment', () => {
    const plan = buildRevealPlan([p('a'), p('b')], empty);
    expect(plan.complete).toBe(true);
    expect(plan.items).toHaveLength(1);
    expect(plan.items[0]).toMatchObject({ kind: 'segment' });
  });

  it('stops at the first unpassed gate (not complete)', () => {
    const plan = buildRevealPlan([p('a'), gate('g1'), p('b')], empty);
    expect(plan.complete).toBe(false);
    const kinds = plan.items.map((i) => i.kind);
    expect(kinds).toEqual(['segment', 'gate']);
    expect(plan.items[1]).toMatchObject({ kind: 'gate', id: 'g1', passed: false });
  });

  it('reveals past a passed gate and completes', () => {
    const state: InteractiveProgressState = { ...empty, revealedGateIds: ['g1'] };
    const plan = buildRevealPlan([p('a'), gate('g1'), p('b')], state);
    expect(plan.complete).toBe(true);
    expect(plan.items.map((i) => i.kind)).toEqual(['segment', 'gate', 'segment']);
  });

  it('stops at an unanswered checkpoint with options but no branch', () => {
    const plan = buildRevealPlan([p('a'), checkpoint('cp1', [['o1', 'A'], ['o2', 'B']]), p('after')], empty);
    expect(plan.complete).toBe(false);
    const cp = plan.items.find((i) => i.kind === 'checkpoint') as Extract<typeof plan.items[number], { kind: 'checkpoint' }>;
    expect(cp.chosenOptionId).toBeNull();
    expect(cp.options).toEqual([{ id: 'o1', label: 'A' }, { id: 'o2', label: 'B' }]);
    expect(cp.branch).toHaveLength(0);
    expect(plan.items.some((i) => i.kind === 'segment' && JSON.stringify(i).includes('after'))).toBe(false);
  });

  it('renders the chosen branch then resumes the main line', () => {
    const state: InteractiveProgressState = { ...empty, checkpointChoices: { cp1: 'o2' } };
    const plan = buildRevealPlan([p('a'), checkpoint('cp1', [['o1', 'A'], ['o2', 'B']]), p('after')], state);
    expect(plan.complete).toBe(true);
    const cp = plan.items.find((i) => i.kind === 'checkpoint') as Extract<typeof plan.items[number], { kind: 'checkpoint' }>;
    expect(cp.chosenOptionId).toBe('o2');
    expect(cp.branch).toHaveLength(1);
    expect(JSON.stringify(cp.branch)).toContain('branch o2');
    expect(plan.items.some((i) => i.kind === 'segment' && JSON.stringify(i).includes('after'))).toBe(true);
  });

  it('a gate inside the chosen branch blocks the main line until passed', () => {
    const cp = {
      type: 'checkpoint',
      attrs: { id: 'cp1' },
      content: [
        { type: 'checkpointOption', attrs: { id: 'o1', label: 'A' }, content: [p('intro'), gate('gIn'), p('more')] },
      ],
    };
    const state: InteractiveProgressState = { ...empty, checkpointChoices: { cp1: 'o1' } };
    const plan = buildRevealPlan([cp, p('after')], state);
    expect(plan.complete).toBe(false);
    expect(plan.items.some((i) => i.kind === 'segment' && JSON.stringify(i).includes('after'))).toBe(false);

    const state2: InteractiveProgressState = { ...empty, checkpointChoices: { cp1: 'o1' }, revealedGateIds: ['gIn'] };
    const plan2 = buildRevealPlan([cp, p('after')], state2);
    expect(plan2.complete).toBe(true);
    expect(plan2.items.some((i) => i.kind === 'segment' && JSON.stringify(i).includes('after'))).toBe(true);
  });
});

describe('hasInteractiveBlocks', () => {
  it('detects gates / checkpoints, incl. nested, else false', () => {
    expect(hasInteractiveBlocks({ type: 'doc', content: [p('a'), gate('g1')] })).toBe(true);
    expect(hasInteractiveBlocks({ type: 'doc', content: [p('a'), checkpoint('cp1', [['o1', 'A']])] })).toBe(true);
    expect(hasInteractiveBlocks({ type: 'doc', content: [p('a'), p('b')] })).toBe(false);
    expect(hasInteractiveBlocks(null)).toBe(false);
  });
});
