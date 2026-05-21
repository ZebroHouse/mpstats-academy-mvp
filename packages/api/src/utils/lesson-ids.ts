/** Извлекает плоский список lessonId из JSON learningPath (старый и sectioned формат). */
export function extractLessonIds(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw as string[];
  if (raw && typeof raw === 'object' && 'sections' in raw) {
    const sections = (raw as { sections?: { lessonIds?: string[] }[] }).sections ?? [];
    return sections.flatMap((s) => s.lessonIds ?? []);
  }
  return [];
}
