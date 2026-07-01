import type { DiagnosticQuestion } from '@mpstats/shared';
import type { StaticQuestion } from './static-deck';

/** Project a static question's source fields into DiagnosticQuestion shape (timecodes lose `label`). */
export function toDiagnosticQuestionSource(q: StaticQuestion): Pick<DiagnosticQuestion, 'sourceLessonIds' | 'sourceTimecodes'> {
  const out: Pick<DiagnosticQuestion, 'sourceLessonIds' | 'sourceTimecodes'> = {};
  if (q.sourceLessonIds?.length) out.sourceLessonIds = q.sourceLessonIds;
  if (q.sourceTimecodes?.length) {
    out.sourceTimecodes = q.sourceTimecodes.map((t) => ({ lessonId: t.lessonId, start: t.start, end: t.end }));
  }
  return out;
}

/** Persisted `sourceData` for an answer. Null when no source at all. */
export function buildAnswerSourceData(question: DiagnosticQuestion): { chunkIds: string[]; lessonIds: string[]; timecodes: any[] } | null {
  const hasChunks = !!question.sourceChunkIds?.length;
  const hasLessons = !!question.sourceLessonIds?.length;
  if (!hasChunks && !hasLessons) return null;
  return { chunkIds: question.sourceChunkIds ?? [], lessonIds: question.sourceLessonIds ?? [], timecodes: question.sourceTimecodes ?? [] };
}
