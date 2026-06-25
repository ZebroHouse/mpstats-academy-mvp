import { describe, it, expect } from 'vitest';
import { extractCheckpoints, tallyCheckpoints } from '../checkpoint-analytics';

// --- Helpers to build TipTap-shaped docs -----------------------------------

function text(value: string) {
  return { type: 'text', text: value };
}

function paragraph(value: string) {
  return { type: 'paragraph', content: [text(value)] };
}

function heading(value: string) {
  return { type: 'heading', attrs: { level: 2 }, content: [text(value)] };
}

function option(id: string, label: string): Record<string, unknown> {
  return {
    type: 'checkpointOption',
    attrs: { id, label },
    content: [paragraph('branch body')],
  };
}

function checkpoint(id: string, options: Record<string, unknown>[]): Record<string, unknown> {
  return { type: 'checkpoint', attrs: { id }, content: options };
}

function gate(id: string) {
  return { type: 'revealGate', attrs: { id, buttonLabel: 'Читать дальше' } };
}

function doc(content: unknown[]) {
  return { type: 'doc', content };
}

// --- extractCheckpoints -----------------------------------------------------

describe('extractCheckpoints', () => {
  it('returns checkpoints in document order with options + labels', () => {
    const body = doc([
      paragraph('intro'),
      checkpoint('cp1', [option('o1', 'Вариант 1'), option('o2', 'Вариант 2')]),
      paragraph('between'),
      checkpoint('cp2', [option('o3', 'Да'), option('o4', 'Нет')]),
    ]);

    const result = extractCheckpoints(body);

    expect(result.map((c) => c.checkpointId)).toEqual(['cp1', 'cp2']);
    expect(result[0].options).toEqual([
      { optionId: 'o1', label: 'Вариант 1' },
      { optionId: 'o2', label: 'Вариант 2' },
    ]);
    expect(result[1].options).toEqual([
      { optionId: 'o3', label: 'Да' },
      { optionId: 'o4', label: 'Нет' },
    ]);
  });

  it('uses the nearest preceding paragraph text as contextLabel', () => {
    const body = doc([
      heading('Раздел'),
      paragraph('Какой следующий шаг вы выберете?'),
      checkpoint('cp1', [option('o1', 'A'), option('o2', 'B')]),
    ]);

    const result = extractCheckpoints(body);
    expect(result[0].contextLabel).toBe('Какой следующий шаг вы выберете?');
  });

  it('truncates contextLabel >80 chars with «…»', () => {
    const long = 'A'.repeat(120);
    const body = doc([paragraph(long), checkpoint('cp1', [option('o1', 'X')])]);

    const result = extractCheckpoints(body);
    expect(result[0].contextLabel.length).toBe(81); // 80 chars + «…»
    expect(result[0].contextLabel.endsWith('…')).toBe(true);
    expect(result[0].contextLabel.startsWith('A'.repeat(80))).toBe(true);
  });

  it('falls back to "Чекпоинт N" when there is no preceding text', () => {
    const body = doc([
      checkpoint('cp1', [option('o1', 'A')]),
      checkpoint('cp2', [option('o2', 'B')]),
    ]);

    const result = extractCheckpoints(body);
    expect(result[0].contextLabel).toBe('Чекпоинт 1');
    expect(result[1].contextLabel).toBe('Чекпоинт 2');
  });

  it('finds a checkpoint nested after a reveal gate (recurses whole tree)', () => {
    const body = doc([
      paragraph('before gate'),
      gate('g1'),
      paragraph('Выберите путь'),
      checkpoint('cpNested', [option('o1', 'Левый'), option('o2', 'Правый')]),
    ]);

    const result = extractCheckpoints(body);
    expect(result.map((c) => c.checkpointId)).toEqual(['cpNested']);
    expect(result[0].contextLabel).toBe('Выберите путь');
  });

  it('finds a checkpoint nested inside a checkpointOption branch', () => {
    const inner = checkpoint('cpInner', [option('oi1', 'I1'), option('oi2', 'I2')]);
    const outerOption = {
      type: 'checkpointOption',
      attrs: { id: 'oo1', label: 'Внешний 1' },
      content: [paragraph('branch text'), inner],
    };
    const body = doc([
      checkpoint('cpOuter', [outerOption, option('oo2', 'Внешний 2')]),
    ]);

    const result = extractCheckpoints(body);
    expect(result.map((c) => c.checkpointId)).toEqual(['cpOuter', 'cpInner']);
    // outer only counts its DIRECT children as options
    expect(result[0].options).toEqual([
      { optionId: 'oo1', label: 'Внешний 1' },
      { optionId: 'oo2', label: 'Внешний 2' },
    ]);
  });

  it('skips checkpoints with empty id', () => {
    const body = doc([
      checkpoint('', [option('o1', 'A')]),
      checkpoint('cp2', [option('o2', 'B')]),
    ]);

    const result = extractCheckpoints(body);
    expect(result.map((c) => c.checkpointId)).toEqual(['cp2']);
  });

  it('returns [] for malformed bodies (null, number, missing content)', () => {
    expect(extractCheckpoints(null)).toEqual([]);
    expect(extractCheckpoints(42)).toEqual([]);
    expect(extractCheckpoints('nope')).toEqual([]);
    expect(extractCheckpoints({})).toEqual([]);
    expect(extractCheckpoints({ type: 'doc' })).toEqual([]);
  });
});

// --- tallyCheckpoints -------------------------------------------------------

describe('tallyCheckpoints', () => {
  const body = doc([
    paragraph('Вопрос'),
    checkpoint('cp1', [option('o1', 'Вариант 1'), option('o2', 'Вариант 2')]),
  ]);

  it('tallies a normal split: counts correct, percents sum ≈100', () => {
    const maps = [
      { cp1: 'o1' },
      { cp1: 'o1' },
      { cp1: 'o2' },
    ];

    const result = tallyCheckpoints(body, maps);
    expect(result).toHaveLength(1);
    expect(result[0].totalAnswered).toBe(3);

    const o1 = result[0].options.find((o) => o.optionId === 'o1')!;
    const o2 = result[0].options.find((o) => o.optionId === 'o2')!;
    expect(o1.count).toBe(2);
    expect(o2.count).toBe(1);
    expect(o1.percent).toBe(67);
    expect(o2.percent).toBe(33);
    expect(o1.percent + o2.percent).toBe(100);
  });

  it('keeps known-option order from body', () => {
    const result = tallyCheckpoints(body, [{ cp1: 'o2' }]);
    expect(result[0].options.map((o) => o.optionId)).toEqual(['o1', 'o2']);
  });

  it('buckets unknown optionIds into "(удалённый вариант)" after known ones', () => {
    const maps = [
      { cp1: 'o1' },
      { cp1: 'deleted-x' },
      { cp1: 'deleted-x' },
      { cp1: 'deleted-y' },
    ];

    const result = tallyCheckpoints(body, maps);
    expect(result[0].totalAnswered).toBe(4);

    const opts = result[0].options;
    // known first, then synthetic unknowns
    expect(opts.slice(0, 2).map((o) => o.optionId)).toEqual(['o1', 'o2']);

    const unknownX = opts.find((o) => o.optionId === 'deleted-x')!;
    const unknownY = opts.find((o) => o.optionId === 'deleted-y')!;
    expect(unknownX.label).toBe('(удалённый вариант)');
    expect(unknownX.count).toBe(2);
    expect(unknownY.label).toBe('(удалённый вариант)');
    expect(unknownY.count).toBe(1);
    // unknowns come after both known options
    expect(opts.indexOf(unknownX)).toBeGreaterThan(1);
  });

  it('empty choiceMaps → all options count 0, totalAnswered 0, percent 0', () => {
    const result = tallyCheckpoints(body, []);
    expect(result[0].totalAnswered).toBe(0);
    expect(result[0].options).toEqual([
      { optionId: 'o1', label: 'Вариант 1', count: 0, percent: 0 },
      { optionId: 'o2', label: 'Вариант 2', count: 0, percent: 0 },
    ]);
  });

  it('does not count a map missing the checkpoint key toward totalAnswered', () => {
    const twoCpBody = doc([
      checkpoint('cp1', [option('o1', 'A'), option('o2', 'B')]),
      checkpoint('cp2', [option('o3', 'C'), option('o4', 'D')]),
    ]);
    const maps: Record<string, string>[] = [
      { cp1: 'o1' }, // only answered cp1
      { cp2: 'o3' }, // only answered cp2
    ];

    const result = tallyCheckpoints(twoCpBody, maps);
    const cp1 = result.find((c) => c.checkpointId === 'cp1')!;
    const cp2 = result.find((c) => c.checkpointId === 'cp2')!;
    expect(cp1.totalAnswered).toBe(1);
    expect(cp2.totalAnswered).toBe(1);
  });

  it('ignores empty-string values and non-object choiceMap entries', () => {
    const maps = [
      { cp1: 'o1' },
      { cp1: '' }, // empty value → not answered
      null,
      42,
      { cp1: 'o2' },
    ] as Record<string, string>[];

    const result = tallyCheckpoints(body, maps);
    expect(result[0].totalAnswered).toBe(2);
    const o1 = result[0].options.find((o) => o.optionId === 'o1')!;
    const o2 = result[0].options.find((o) => o.optionId === 'o2')!;
    expect(o1.count).toBe(1);
    expect(o2.count).toBe(1);
  });

  it('returns [] when body has no checkpoints', () => {
    expect(tallyCheckpoints(doc([paragraph('plain')]), [{ x: 'y' }])).toEqual([]);
    expect(tallyCheckpoints(null, [])).toEqual([]);
  });
});
