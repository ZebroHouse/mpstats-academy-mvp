import { describe, it, expect } from 'vitest';
import { toDiagnosticQuestionSource, buildAnswerSourceData } from '../question-source';
import type { StaticQuestion } from '../static-deck';

const base: StaticQuestion = { id: 'q1', axis: 'ANALYTICS', level: 1, marketplace: 'WB', prompt: 'p', options: ['a','b','c','d'], explanation: 'e' };

describe('toDiagnosticQuestionSource', () => {
  it('passes through source fields', () => {
    const q = { ...base, sourceLessonIds: ['l1'], sourceTimecodes: [{ lessonId: 'l1', label: 'x', start: 1, end: 2 }] };
    expect(toDiagnosticQuestionSource(q)).toEqual({ sourceLessonIds: ['l1'], sourceTimecodes: [{ lessonId: 'l1', start: 1, end: 2 }] });
  });
  it('returns empty object when absent', () => { expect(toDiagnosticQuestionSource(base)).toEqual({}); });
});

describe('buildAnswerSourceData', () => {
  it('null when neither chunkIds nor lessonIds', () => { expect(buildAnswerSourceData({} as any)).toBeNull(); });
  it('builds from sourceLessonIds', () => {
    expect(buildAnswerSourceData({ sourceLessonIds: ['l1'] } as any)).toEqual({ chunkIds: [], lessonIds: ['l1'], timecodes: [] });
  });
  it('builds from sourceChunkIds (legacy)', () => {
    expect(buildAnswerSourceData({ sourceChunkIds: ['c1'], sourceLessonIds: ['l1'], sourceTimecodes: [{ lessonId: 'l1', start: 0, end: 1 }] } as any))
      .toEqual({ chunkIds: ['c1'], lessonIds: ['l1'], timecodes: [{ lessonId: 'l1', start: 0, end: 1 }] });
  });
});
