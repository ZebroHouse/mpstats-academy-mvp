'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { trpc } from '@/lib/trpc/client';

const BLUE = '#2C4FF8';
const BLUE_HOVER = '#1D39C1';
const DARK = '#0F172A';

type AccessState = 'loading' | 'unauthed' | 'no_access' | 'has_access';

const ACTIVE_SUB_STATUSES = ['ACTIVE', 'TRIAL', 'CANCELLED'];

function useCourseAccess(courseId: string): AccessState {
  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    const sb = createClient();
    sb.auth.getUser().then(({ data }) => setAuthed(!!data.user));
    const { data: sub } = sb.auth.onAuthStateChange((_e, s) =>
      setAuthed(!!s?.user),
    );
    return () => sub.subscription.unsubscribe();
  }, []);

  const { data: subscription, isLoading } = trpc.billing.getSubscription.useQuery(
    undefined,
    {
      enabled: authed === true,
      retry: false,
      refetchOnWindowFocus: false,
    },
  );

  if (authed === null) return 'loading';
  if (authed === false) return 'unauthed';
  if (isLoading) return 'loading';

  if (!subscription) return 'no_access';
  if (!ACTIVE_SUB_STATUSES.includes(subscription.status)) return 'no_access';
  if (
    !subscription.currentPeriodEnd ||
    new Date(subscription.currentPeriodEnd) <= new Date()
  ) {
    return 'no_access';
  }

  const planType = subscription.plan?.type;
  if (planType === 'PLATFORM') return 'has_access';
  if (planType === 'COURSE' && subscription.courseId === courseId) return 'has_access';
  return 'no_access';
}

interface CourseHeroCTAProps {
  courseId: string;
}

/**
 * Top hero CTA: "Начать обучение" → scroll to bottom CTA section.
 * For authed users with access — "Открыть курс" → /learn?courseId=...
 */
export function CourseHeroCTA({ courseId }: CourseHeroCTAProps) {
  const hasAccess = useCourseAccess(courseId) === 'has_access';
  const href = hasAccess ? `/learn?courseId=${courseId}` : '#cta';
  const label = hasAccess ? 'Открыть курс' : 'Начать обучение';

  return (
    <a
      href={href}
      className="inline-flex items-center justify-center rounded-full h-[52px] sm:h-[58px] px-8 sm:px-10 text-[15px] sm:text-[16px] font-medium text-white transition-colors"
      style={{ backgroundColor: BLUE }}
      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = BLUE_HOVER)}
      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = BLUE)}
    >
      {label}
    </a>
  );
}

interface CoursePricingSectionProps {
  courseId: string;
}

/**
 * Bottom CTA section. Shows pricing pitch by default; for authed users with
 * access — switches to "you already have this course, open it" copy + button.
 * Keeps `id="cta"` so the top hero anchor still works for unauthed users.
 */
export function CoursePricingSection({ courseId }: CoursePricingSectionProps) {
  const hasAccess = useCourseAccess(courseId) === 'has_access';

  const heading = hasAccess
    ? 'Этот курс уже у вас в каталоге'
    : 'Весь каталог за 2 990 ₽/мес';
  const subtext = hasAccess
    ? 'Откройте каталог курса и продолжите обучение с того места, где остановились.'
    : 'Этот курс входит в подписку PLATFORM. Полный доступ к каталогу по 5 осям навыков, AI-диагностика за 10 минут, персональный план обучения.';
  const buttonHref = hasAccess ? `/learn?courseId=${courseId}` : '/pricing';
  const buttonLabel = hasAccess ? 'Открыть курс' : 'Оформить подписку';

  return (
    <section
      id="cta"
      style={{ backgroundColor: DARK }}
      className="py-[60px] sm:py-[80px] lg:py-[100px] px-4 sm:px-6 md:px-10 lg:px-0"
    >
      <div className="max-w-[720px] mx-auto text-center">
        <h2 className="text-[24px] sm:text-[32px] md:text-[44px] font-bold leading-[1.1] tracking-tight text-white">
          {heading}
        </h2>
        <p
          className="mt-4 sm:mt-5 text-[15px] sm:text-[17px] leading-relaxed"
          style={{ color: 'rgba(255,255,255,0.6)' }}
        >
          {subtext}
        </p>
        <div className="mt-8 sm:mt-10">
          <a
            href={buttonHref}
            className="inline-flex items-center justify-center rounded-full h-[52px] sm:h-[62px] px-10 sm:px-12 text-[15px] sm:text-[16px] font-medium text-white transition-colors"
            style={{ backgroundColor: BLUE }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = BLUE_HOVER)}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = BLUE)}
          >
            {buttonLabel}
          </a>
        </div>
      </div>
    </section>
  );
}
