import { prisma } from '@mpstats/db';

export interface CourseFact {
  title: string;
  lessonCount: number;
  topics: string[]; // верхнеуровневые темы (первые N названий уроков)
}

const MAX_TOPICS = 6;

// Pure: факты курсов → краткий грунд-текст для LLM.
export function formatCourseFacts(facts: CourseFact[]): string {
  if (facts.length === 0) {
    return 'В каталоге платформы не нашёл подходящего курса по этому запросу.';
  }
  return facts
    .map((f) => {
      const topics = f.topics.slice(0, MAX_TOPICS).join(', ');
      return `Курс «${f.title}»: ${f.lessonCount} опубликованных уроков. Темы: ${topics}.`;
    })
    .join('\n');
}

// Живая выборка: все видимые курсы + число опубликованных уроков + первые темы.
export async function resolveCourseFacts(): Promise<CourseFact[]> {
  const courses = await prisma.course.findMany({
    where: { isHidden: false },
    select: {
      title: true,
      lessons: {
        where: { isHidden: false },
        select: { title: true },
        orderBy: { order: 'asc' },
      },
    },
    orderBy: { order: 'asc' },
  });
  return courses.map((c) => ({
    title: c.title,
    lessonCount: c.lessons.length,
    topics: c.lessons.map((l) => l.title),
  }));
}
