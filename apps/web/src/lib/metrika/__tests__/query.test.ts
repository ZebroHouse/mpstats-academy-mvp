import { describe, expect, it } from 'vitest';
import { buildByTimeParams, parseByTimeResponse, splitRange, toDateKey } from '../query';

describe('toDateKey', () => {
  it('форматирует дату в YYYY-MM-DD по UTC', () => {
    expect(toDateKey(new Date('2026-07-13T22:30:00.000Z'))).toBe('2026-07-13');
  });
});

describe('splitRange', () => {
  it('возвращает один кусок, если диапазон короче лимита', () => {
    expect(splitRange('2026-07-01', '2026-07-10', 60)).toEqual([
      { date1: '2026-07-01', date2: '2026-07-10' },
    ]);
  });

  it('режет длинный диапазон на куски не длиннее лимита', () => {
    // Метрика отвечает "Query is too complicated" на длинных окнах —
    // проверено на 30 днях без фильтра.
    const chunks = splitRange('2026-01-01', '2026-03-01', 30);
    expect(chunks).toEqual([
      { date1: '2026-01-01', date2: '2026-01-30' },
      { date1: '2026-01-31', date2: '2026-03-01' },
    ]);
  });

  it('покрывает диапазон без дыр и без нахлёста', () => {
    const chunks = splitRange('2026-01-01', '2026-04-15', 30);
    expect(chunks[0].date1).toBe('2026-01-01');
    expect(chunks[chunks.length - 1].date2).toBe('2026-04-15');
    for (let i = 1; i < chunks.length; i++) {
      const prevEnd = new Date(chunks[i - 1].date2 + 'T00:00:00.000Z').getTime();
      const nextStart = new Date(chunks[i].date1 + 'T00:00:00.000Z').getTime();
      expect(nextStart - prevEnd).toBe(86_400_000);
    }
  });
});

describe('buildByTimeParams', () => {
  it('всегда ставит фильтр по платформе и группировку по дням', () => {
    const p = buildByTimeParams({
      counterId: '94592073',
      metrics: ['ym:s:visits', 'ym:s:users'],
      date1: '2026-07-01',
      date2: '2026-07-07',
    });
    expect(p.get('ids')).toBe('94592073');
    expect(p.get('metrics')).toBe('ym:s:visits,ym:s:users');
    expect(p.get('group')).toBe('day');
    expect(p.get('filters')).toBe("ym:s:startURL=*'*platform.mpstats.academy*'");
  });
});

describe('parseByTimeResponse', () => {
  const response = {
    time_intervals: [
      ['2026-07-13', '2026-07-13'],
      ['2026-07-14', '2026-07-14'],
    ],
    totals: [
      [260, 276],
      [216, 228],
    ],
  };

  it('раскладывает totals в строки снапшота', () => {
    expect(parseByTimeResponse(response, ['visits', 'users'])).toEqual([
      { metricKey: 'visits', day: '2026-07-13', value: 260 },
      { metricKey: 'visits', day: '2026-07-14', value: 276 },
      { metricKey: 'users', day: '2026-07-13', value: 216 },
      { metricKey: 'users', day: '2026-07-14', value: 228 },
    ]);
  });

  it('округляет дробные значения до целого', () => {
    const r = { time_intervals: [['2026-07-13', '2026-07-13']], totals: [[12.7]] };
    expect(parseByTimeResponse(r, ['visits'])[0].value).toBe(13);
  });

  it('возвращает пустой массив, если Метрика не вернула интервалов', () => {
    expect(parseByTimeResponse({ time_intervals: [], totals: [] }, ['visits'])).toEqual([]);
  });

  it('падает, если число серий не совпало с числом запрошенных ключей', () => {
    // Молчаливое рассогласование записало бы визиты под ключом уников.
    expect(() => parseByTimeResponse(response, ['visits'])).toThrow(/2 серий.*1 ключ/);
  });
});
