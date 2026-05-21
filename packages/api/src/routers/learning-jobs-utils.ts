/**
 * Decide which lessons of a removed job to actually remove from LearningPath.lessons.
 * Retain any lesson still present in another added job (no orphan references).
 */
export function lessonsToRemoveOnJobRemove(
  removedJobLessonIds: string[],
  otherAddedJobs: { id: string; lessonIds: string[] }[],
): string[] {
  const retained = new Set<string>();
  for (const job of otherAddedJobs) {
    for (const id of job.lessonIds) retained.add(id);
  }
  return removedJobLessonIds.filter((id) => !retained.has(id));
}
