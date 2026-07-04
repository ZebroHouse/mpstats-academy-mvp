import { parseLearningPath, type LessonContextKind } from '@mpstats/shared';

export function parseFromParam(from?: string): { kind: LessonContextKind; jobSlug?: string } {
  if (from?.startsWith('job:')) {
    const slug = from.slice(4);
    if (slug.length > 0) return { kind: 'job', jobSlug: slug };
    return { kind: 'course' };
  }
  if (from === 'plan' || from === 'favorites' || from === 'storefront') return { kind: from };
  return { kind: 'course' };
}

export function resolveContextNav(
  orderedIds: string[],
  currentId: string,
): { index: number; nextId: string | null; prevId: string | null; isLast: boolean } {
  const index = orderedIds.indexOf(currentId);
  if (index === -1) return { index: -1, nextId: null, prevId: null, isLast: true };
  const nextId = index < orderedIds.length - 1 ? orderedIds[index + 1] : null;
  const prevId = index > 0 ? orderedIds[index - 1] : null;
  return { index, nextId, prevId, isLast: nextId === null };
}

export function flattenPlanLessonIds(lessonsJson: unknown): string[] {
  const parsed = parseLearningPath(lessonsJson);
  if (Array.isArray(parsed)) return [...parsed];
  if (!parsed || !Array.isArray((parsed as { sections?: unknown[] }).sections)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const s of (parsed as { sections: Array<{ lessonIds?: string[]; errorLessonIds?: string[] }> }).sections) {
    for (const id of [...(s.errorLessonIds ?? []), ...(s.lessonIds ?? [])]) {
      if (!seen.has(id)) {
        seen.add(id);
        out.push(id);
      }
    }
  }
  return out;
}
