import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { prisma } from '@mpstats/db';

/**
 * `/learn` is a Server Component entry that redirects to the correct default
 * sub-section (D-01). It NEVER renders content; the redirect happens server-side
 * via `redirect()` only — a client navigation in an effect would re-trigger the
 * Next Router Cache loop (RESEARCH Pitfall 1, incident 2026-05-19). All former
 * lens UI now lives in /learn/solutions and /learn/library (61-02 Task 1).
 *
 * Default rule (UI-SPEC §Interaction): non-empty personal plan → /learn/plan,
 * otherwise → /learn/library.
 */
export default async function LearnPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  const user = data?.user;

  // The (main) layout already guards unauthenticated users; this is a safety net.
  if (!user) {
    redirect('/login');
  }

  const path = await prisma.learningPath.findUnique({
    where: { userId: user.id },
    select: { lessons: true, addedJobs: true },
  });

  const raw = path?.lessons as unknown;
  const addedJobs = path?.addedJobs;
  const hasArrayLessons = Array.isArray(raw) && raw.length > 0;
  const hasSectionLessons =
    !!raw && typeof raw === 'object' &&
    Array.isArray((raw as { sections?: unknown[] }).sections) &&
    (raw as { sections: Array<{ lessonIds?: unknown[]; errorLessonIds?: unknown[] }> }).sections.some(
      (s) => (s.lessonIds?.length ?? 0) > 0 || (s.errorLessonIds?.length ?? 0) > 0,
    );
  const hasAddedJobs = Array.isArray(addedJobs) && addedJobs.length > 0;
  const hasPlan = hasArrayLessons || hasSectionLessons || hasAddedJobs;

  redirect(hasPlan ? '/learn/plan' : '/learn/library');
}
