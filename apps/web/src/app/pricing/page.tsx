'use client';

import { Suspense, useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Script from 'next/script';
import { Onest } from 'next/font/google';
import { toast } from 'sonner';
import { V8Header } from '@/components/v8/V8Header';
import { V8Footer } from '@/components/v8/V8Footer';
import { Reveal } from '@/components/v8/Reveal';
import { StickyCTA } from '@/components/v8/StickyCTA';
import { trpc } from '@/lib/trpc/client';
import { openPaymentWidget } from '@/lib/cloudpayments/widget';
import { reachGoal } from '@/lib/analytics/metrika';
import { METRIKA_GOALS } from '@/lib/analytics/constants';

const onest = Onest({
  subsets: ['latin', 'cyrillic'],
  weight: ['400', '500', '700'],
  display: 'swap',
});

/* ── Brand tokens ──────────────────────────────────────── */
const BLUE = '#2C4FF8';
const BLUE_HOVER = '#1D39C1';
const ORANGE = '#ff6b16';
const DARK = '#0F172A';
const GRAY_BG = '#f4f4f4';
const TEXT = '#121212';

/* ── Data ──────────────────────────────────────────────── */

const COURSE_FEATURES = [
  'Все материалы курса',
  'AI-ассистент',
  'Персональный план обучения',
];

// Короткие подписи для pill-chips. Backend id → короткое имя
const COURSE_SHORT_LABEL: Record<string, string> = {
  '01_analytics': 'Аналитика',
  '02_ads':       'Реклама WB',
  '03_ai':        'Нейросети',
  '05_ozon':      'Ozon',
};

const PLATFORM_FEATURES = [
  'Все 4 курса платформы',
  '400+ уроков, 150+ часов контента',
  'AI-диагностика',
  'AI-ассистент',
  'Персональный план обучения',
  'Новые материалы и обновления',
];

const COMPARISON_ROWS = [
  { feature: 'Курс',               course: 'Один на выбор', platform: 'Все курсы платформы' },
  { feature: 'AI-диагностика',     course: false,           platform: true },
  { feature: 'Персональный план',  course: true,            platform: true },
  { feature: 'AI-ассистент',       course: true,            platform: true },
  { feature: 'Уроки',              course: '~70',           platform: '400+' },
  { feature: 'Новые материалы',    course: true,            platform: true },
];

const FAQS = [
  { q: 'Когда списывается оплата?', a: 'Оплата списывается при оформлении подписки. Следующее списание происходит через 30 дней. За 3 дня до списания мы напомним о продлении и отправим уведомление.' },
  { q: 'Можно ли сменить тариф?', a: 'Да. В любой момент можно перейти с подписки на курс на полный доступ. Новый тариф начнет действовать сразу.' },
  { q: 'Можно ли отключить подписку?', a: 'Да. Подписку можно отключить в личном кабинете в любое время. Доступ к платформе сохранится до конца оплаченного периода.' },
  { q: 'Есть ли пробный период?', a: 'Нет. Но вы можете бесплатно пройти AI-диагностику и получить рекомендации по обучению до оформления подписки.' },
  { q: 'Что входит в тариф «Полный доступ»?', a: 'Все материалы платформы без ограничений: 4 курса, 400+ уроков, 150+ часов контента, AI-диагностика, персональный план обучения и AI-ассистент.' },
  { q: 'Чем отличается подписка на курс от полного доступа?', a: 'Подписка на курс открывает один выбранный курс. Полный доступ включает все курсы, уроки и дополнительные материалы платформы.' },
  { q: 'Можно ли оплатить обучение от лица компании?', a: 'Да. Мы работаем с юридическими лицами и предоставляем закрывающие документы. Для оформления напишите на support@mpstats.academy.' },
];

const PROMO_STORAGE_KEY = 'pending_promo_code';

/* ── Icons ─────────────────────────────────────────────── */

function ChevronDown({ open }: { open: boolean }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      className={`transition-transform duration-200 ${open ? 'rotate-180' : ''}`}>
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function CheckIcon({ color = BLUE }: { color?: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function DashIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#121212" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 opacity-20">
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

/* ── FAQ Item ──────────────────────────────────────────── */

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-[#121212]/10 last:border-b-0">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between py-6 text-left cursor-pointer"
      >
        <span className="text-[17px] sm:text-[19px] font-medium pr-4" style={{ color: TEXT }}>{q}</span>
        <span className="flex-shrink-0" style={{ color: TEXT }}><ChevronDown open={open} /></span>
      </button>
      <div className={`overflow-hidden transition-all duration-300 ${open ? 'max-h-[400px] pb-6' : 'max-h-0'}`}>
        <p className="text-[15px] sm:text-[16px] leading-relaxed" style={{ color: TEXT, opacity: 0.7 }}>{a}</p>
      </div>
    </div>
  );
}

/* ── Comparison Cell ──────────────────────────────────── */

function ComparisonCell({ value, highlighted }: { value: boolean | string; highlighted?: boolean }) {
  if (typeof value === 'string') {
    return (
      <span className={`text-[16px] sm:text-[18px] font-medium ${highlighted ? 'text-white' : ''}`} style={!highlighted ? { color: TEXT } : undefined}>
        {value}
      </span>
    );
  }
  if (value) {
    return <CheckIcon color={highlighted ? '#ffffff' : BLUE} />;
  }
  return <DashIcon />;
}

/* ── Page Content ──────────────────────────────────────── */

function PricingContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [widgetReady, setWidgetReady] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedCourseId, setSelectedCourseId] = useState('');

  const [promoCode, setPromoCode] = useState(searchParams.get('promo') || '');
  const [promoError, setPromoError] = useState('');

  // tRPC queries — все tolerant к неавторизованным
  const { data: plans } = trpc.billing.getPlans.useQuery();
  const { data: courses } = trpc.billing.getCourses.useQuery();
  const { data: subscription } = trpc.billing.getSubscription.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  });
  const { data: profile } = trpc.profile.get.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  });
  const isAuthenticated = !!profile;

  const initiatePayment = trpc.billing.initiatePayment.useMutation();
  const activatePromo = trpc.promo.activate.useMutation({
    onSuccess: (data) => {
      toast.success('Промо-код активирован!', {
        description: `Доступ до ${new Date(data.accessUntil).toLocaleDateString('ru-RU')}`,
      });
      setTimeout(() => router.push('/dashboard'), 1500);
    },
    onError: (err) => setPromoError(err.message),
  });

  // Filter courses для pill-chips
  const courseOptions = (courses || [])
    .filter((c) => COURSE_SHORT_LABEL[c.id])
    .map((c) => ({ id: c.id, name: COURSE_SHORT_LABEL[c.id] }));

  // Default first course id
  useEffect(() => {
    if (!selectedCourseId && courseOptions.length > 0) {
      setSelectedCourseId(courseOptions[0].id);
    }
  }, [courseOptions, selectedCourseId]);

  // Metrika pricing view
  useEffect(() => {
    reachGoal(METRIKA_GOALS.PRICING_VIEW);
  }, []);

  // Restore pending promo from sessionStorage after register/login redirect
  useEffect(() => {
    if (isAuthenticated && !promoCode) {
      try {
        const stored = sessionStorage.getItem(PROMO_STORAGE_KEY);
        if (stored) {
          setPromoCode(stored);
          sessionStorage.removeItem(PROMO_STORAGE_KEY);
        }
      } catch {
        /* sessionStorage unavailable */
      }
    }
  }, [isAuthenticated, promoCode]);

  // Авто-активация промо, если юзер пришёл после DOI с ?promo=CODE в URL
  // (через auth/callback?next=/pricing?promo=...).
  // Activate mutation сам проверит что код валиден и не использован — если нет,
  // покажет ошибку в UI, юзер увидит форму с уже введённым кодом.
  const promoFromUrl = searchParams.get('promo');
  const [autoActivated, setAutoActivated] = useState(false);
  useEffect(() => {
    if (!autoActivated && isAuthenticated && promoFromUrl && !activatePromo.isPending) {
      setAutoActivated(true);
      activatePromo.mutate({ code: promoFromUrl.trim().toUpperCase() });
    }
  }, [autoActivated, isAuthenticated, promoFromUrl, activatePromo]);

  const hasActiveCourseSubscription =
    subscription &&
    subscription.plan.type === 'COURSE' &&
    ['ACTIVE', 'PAST_DUE'].includes(subscription.status) &&
    subscription.courseId === selectedCourseId;

  const hasActivePlatformSubscription =
    subscription &&
    subscription.plan.type === 'PLATFORM' &&
    ['ACTIVE', 'PAST_DUE'].includes(subscription.status);

  const handlePayment = async (planType: 'COURSE' | 'PLATFORM') => {
    if (planType === 'COURSE' && !selectedCourseId) {
      toast.error('Выберите курс');
      return;
    }

    setIsProcessing(true);
    try {
      const result = await initiatePayment.mutateAsync({
        planType,
        courseId: planType === 'COURSE' ? selectedCourseId : undefined,
      });

      const success = await openPaymentWidget({
        publicId: process.env.NEXT_PUBLIC_CLOUDPAYMENTS_PUBLIC_ID!,
        description: result.description,
        amount: result.amount,
        currency: 'RUB',
        accountId: result.userId,
        invoiceId: result.subscriptionId,
        recurrent: { interval: 'Month', period: 1 },
        receipt: result.receipt,
      });

      if (success) {
        reachGoal(METRIKA_GOALS.PAYMENT, { planType, amount: result.amount, currency: 'RUB' });
        toast.success('Оплата прошла успешно', { description: 'Подписка активируется в течение минуты.' });
        setTimeout(() => router.push('/profile'), 2000);
      } else {
        toast.error('Оплата не прошла', { description: 'Попробуйте снова или выберите другой способ оплаты.' });
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Произошла ошибка';
      const isAuthError = errorMessage.includes('UNAUTHORIZED') || errorMessage.toLowerCase().includes('not authenticated');
      if (isAuthError) {
        toast.info('Перенаправляем на регистрацию');
        setTimeout(() => router.push('/register?redirect=/pricing'), 1500);
        return;
      }
      toast.error(errorMessage);
    } finally {
      setIsProcessing(false);
    }
  };

  const handlePromoApply = () => {
    const trimmed = promoCode.trim().toUpperCase();
    if (!trimmed) {
      setPromoError('Введите промо-код');
      return;
    }
    setPromoError('');

    if (!isAuthenticated) {
      try {
        sessionStorage.setItem(PROMO_STORAGE_KEY, trimmed);
      } catch {
        /* sessionStorage unavailable */
      }
      router.push(`/register?redirect=/pricing&promo=${encodeURIComponent(trimmed)}`);
      return;
    }
    activatePromo.mutate({ code: trimmed });
  };

  const courseBtnDisabled = Boolean(isProcessing || !widgetReady || !selectedCourseId || hasActiveCourseSubscription);
  const platformBtnDisabled = Boolean(isProcessing || !widgetReady || hasActivePlatformSubscription);

  return (
    <div className={onest.className} style={{ color: TEXT }}>
      <Script
        src="https://widget.cloudpayments.ru/bundles/cloudpayments"
        strategy="lazyOnload"
        onReady={() => setWidgetReady(true)}
      />

      <V8Header onDarkHero={true} />

      {/* ── 1. Hero ────────────────────────────────────── */}
      <section
        className="relative pt-[140px] pb-[80px] sm:pt-[160px] sm:pb-[100px] px-6"
        style={{ backgroundColor: DARK }}
      >
        <div className="max-w-[800px] mx-auto text-center">
          <h1 className="text-[36px] sm:text-[48px] md:text-[56px] font-bold leading-[1.1] tracking-tight text-white">
            400+ уроков MPSTATS Academy
            <br />
            за 2 990 ₽ в месяц
          </h1>
          <p className="mt-6 text-[18px] sm:text-[20px] leading-relaxed text-white/70 max-w-[520px] mx-auto">
            Помесячная подписка без оплаты курса целиком. Изучайте материалы платформы, пользуйтесь AI-инструментами и развивайте навыки за фиксированную сумму в месяц
          </p>
        </div>
      </section>

      {/* ── 2. Pricing Cards + promo ────────────────────── */}
      <section id="тарифы" className="py-[80px] sm:py-[100px] px-6 bg-white">
        <div className="max-w-[1040px] mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 lg:gap-6">

            {/* COURSE card */}
            <Reveal className="rounded-[40px] border border-[#121212]/10 p-7 sm:p-9 flex flex-col transition-transform duration-300 hover:-translate-y-1" delay={0}>
              <div>
                <h3 className="text-[22px] sm:text-[24px] font-bold" style={{ color: TEXT }}>
                  Подписка на курс
                </h3>
                <div className="mt-4 flex items-baseline gap-1">
                  <span className="text-[36px] sm:text-[44px] font-bold leading-none" style={{ color: TEXT }}>
                    1 990 &#8381;
                  </span>
                  <span className="text-[17px]" style={{ color: TEXT, opacity: 0.5 }}>
                    /мес
                  </span>
                </div>
              </div>

              {/* Course picker */}
              <div className="mt-6">
                <p className="text-[12px] font-medium uppercase tracking-wider mb-3" style={{ color: TEXT, opacity: 0.45 }}>
                  Выберите курс
                </p>
                <div className="flex flex-wrap gap-2">
                  {courseOptions.length === 0 ? (
                    <span className="text-[13px]" style={{ color: TEXT, opacity: 0.5 }}>Загрузка...</span>
                  ) : (
                    courseOptions.map((c) => {
                      const active = selectedCourseId === c.id;
                      return (
                        <button
                          key={c.id}
                          onClick={() => setSelectedCourseId(c.id)}
                          className="px-4 py-2 rounded-full text-[13px] sm:text-[14px] font-medium transition-colors cursor-pointer"
                          style={{
                            backgroundColor: active ? BLUE : 'rgba(18,18,18,0.05)',
                            color: active ? 'white' : TEXT,
                          }}
                        >
                          {c.name}
                        </button>
                      );
                    })
                  )}
                </div>
              </div>

              <ul className="mt-6 flex flex-col gap-3 flex-1">
                {COURSE_FEATURES.map((f) => (
                  <li key={f} className="flex items-center gap-3">
                    <CheckIcon />
                    <span className="text-[14px] sm:text-[15px]" style={{ color: TEXT, opacity: 0.8 }}>{f}</span>
                  </li>
                ))}
              </ul>

              <button
                onClick={() => handlePayment('COURSE')}
                disabled={courseBtnDisabled}
                className="mt-8 inline-flex items-center justify-center h-[52px] sm:h-[56px] rounded-full text-[15px] font-medium border-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ borderColor: BLUE, color: BLUE, backgroundColor: 'transparent' }}
                onMouseEnter={(e) => {
                  if (courseBtnDisabled) return;
                  e.currentTarget.style.backgroundColor = BLUE;
                  e.currentTarget.style.color = '#fff';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                  e.currentTarget.style.color = BLUE;
                }}
              >
                {hasActiveCourseSubscription
                  ? 'Текущий план'
                  : isProcessing
                    ? 'Обработка...'
                    : 'Оформить подписку'}
              </button>
            </Reveal>

            {/* PLATFORM card */}
            <Reveal className="rounded-[40px] p-7 sm:p-9 flex flex-col relative overflow-hidden transition-transform duration-300 hover:-translate-y-1" style={{ backgroundColor: BLUE }} delay={100}>
              <span
                className="absolute top-5 right-5 sm:top-6 sm:right-6 px-3.5 py-1 rounded-full text-[12px] font-medium text-white"
                style={{ backgroundColor: ORANGE }}
              >
                Рекомендуем
              </span>

              <div>
                <h3 className="text-[22px] sm:text-[24px] font-bold text-white">
                  Полный доступ
                </h3>
                <div className="mt-4 flex items-baseline gap-1">
                  <span className="text-[36px] sm:text-[44px] font-bold leading-none text-white">
                    2 990 &#8381;
                  </span>
                  <span className="text-[17px] text-white/50">
                    /мес
                  </span>
                </div>
              </div>

              <ul className="mt-6 flex flex-col gap-3 flex-1">
                {PLATFORM_FEATURES.map((f) => (
                  <li key={f} className="flex items-center gap-3">
                    <CheckIcon color="#ffffff" />
                    <span className="text-[14px] sm:text-[15px] text-white/85">{f}</span>
                  </li>
                ))}
              </ul>

              <button
                onClick={() => handlePayment('PLATFORM')}
                disabled={platformBtnDisabled}
                className="mt-8 inline-flex items-center justify-center h-[52px] sm:h-[56px] rounded-full text-[15px] font-medium transition-opacity hover:opacity-90 disabled:opacity-60 disabled:cursor-not-allowed"
                style={{ backgroundColor: '#ffffff', color: BLUE }}
              >
                {hasActivePlatformSubscription
                  ? 'Текущий план'
                  : isProcessing
                    ? 'Обработка...'
                    : 'Оформить подписку'}
              </button>
            </Reveal>
          </div>

          {/* Promo code — under both cards */}
          <div className="mt-8 sm:mt-10 mx-auto w-full max-w-[420px]">
            <p className="text-center text-[13px] font-medium uppercase tracking-wider mb-3" style={{ color: TEXT, opacity: 0.45 }}>
              Есть промокод?
            </p>
            <div className="flex items-stretch justify-center gap-2 sm:gap-3">
              <input
                type="text"
                value={promoCode}
                onChange={(e) => {
                  setPromoCode(e.target.value.toUpperCase());
                  if (promoError) setPromoError('');
                }}
                onKeyDown={(e) => { if (e.key === 'Enter') handlePromoApply(); }}
                placeholder="Введите промокод"
                disabled={activatePromo.isPending}
                className="flex-1 min-w-0 h-[48px] sm:h-[52px] px-5 rounded-full border border-[#121212]/10 text-[14px] sm:text-[15px] font-medium outline-none transition-colors focus:border-[#2C4FF8] disabled:opacity-60"
                style={{ color: TEXT, backgroundColor: '#fff' }}
              />
              <button
                onClick={handlePromoApply}
                disabled={activatePromo.isPending || !promoCode.trim()}
                className="flex-shrink-0 h-[48px] sm:h-[52px] px-6 sm:px-7 rounded-full text-[14px] sm:text-[15px] font-medium text-white transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                style={{ backgroundColor: BLUE }}
                onMouseEnter={(e) => { if (!e.currentTarget.disabled) e.currentTarget.style.backgroundColor = BLUE_HOVER; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = BLUE; }}
              >
                {activatePromo.isPending ? 'Проверка...' : 'Применить'}
              </button>
            </div>
            {promoError && (
              <p className="mt-3 text-center text-[13px]" style={{ color: '#dc2626' }}>{promoError}</p>
            )}
          </div>
        </div>
      </section>

      {/* ── 3. Comparison Table ─────────────────────────── */}
      <section id="сравнение" className="py-[80px] sm:py-[100px] px-6" style={{ backgroundColor: GRAY_BG }}>
        <div className="max-w-[800px] mx-auto">
          <h2 className="text-[28px] sm:text-[36px] font-bold text-center mb-12" style={{ color: TEXT }}>
            Сравнение тарифов
          </h2>

          <div className="rounded-[40px] overflow-hidden bg-white">
            {/* Header row */}
            <div className="grid grid-cols-3 gap-0">
              <div className="p-5 sm:p-6" />
              <div className="p-5 sm:p-6 text-center">
                <span className="text-[14px] sm:text-[16px] font-medium" style={{ color: TEXT, opacity: 0.6 }}>Подписка на курс</span>
              </div>
              <div className="p-5 sm:p-6 text-center rounded-tr-[40px]" style={{ backgroundColor: BLUE }}>
                <span className="text-[14px] sm:text-[16px] font-medium text-white">Полный доступ</span>
              </div>
            </div>

            {/* Data rows */}
            {COMPARISON_ROWS.map((row, i) => (
              <div key={row.feature} className="grid grid-cols-3 gap-0" style={{ borderTop: '1px solid rgba(18,18,18,0.06)' }}>
                <div className="p-5 sm:p-6 flex items-center">
                  <span className="text-[14px] sm:text-[16px]" style={{ color: TEXT }}>{row.feature}</span>
                </div>
                <div className="p-5 sm:p-6 flex items-center justify-center">
                  <ComparisonCell value={row.course} />
                </div>
                <div
                  className="p-5 sm:p-6 flex items-center justify-center"
                  style={{
                    backgroundColor: BLUE,
                    ...(i === COMPARISON_ROWS.length - 1 ? { borderBottomRightRadius: '40px' } : {}),
                  }}
                >
                  <ComparisonCell value={row.platform} highlighted />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 4. Retention — 3 ценности ───────────────────── */}
      <section className="py-[80px] sm:py-[100px] px-6 bg-white">
        <div className="max-w-[1160px] mx-auto">
          <h2 className="text-[24px] sm:text-[32px] md:text-[36px] font-bold text-center mb-4 leading-tight" style={{ color: TEXT }}>
            Что входит в полный доступ
          </h2>
          <p className="text-center text-[15px] sm:text-[17px] leading-relaxed max-w-[620px] mx-auto mb-10 sm:mb-14" style={{ color: TEXT, opacity: 0.6 }}>
            Все возможности платформы в одной подписке
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-[1040px] mx-auto">
            {/* 01 — Доступ */}
            <Reveal className="rounded-[32px] p-8 bg-white border border-[#121212]/10 transition-transform duration-300 hover:-translate-y-1" delay={0}>
              <span className="text-[32px] sm:text-[36px] font-bold leading-none" style={{ color: BLUE, opacity: 0.25 }}>01</span>
              <h3 className="mt-4 text-[18px] sm:text-[20px] font-bold leading-tight" style={{ color: TEXT }}>
                4 курса
              </h3>
              <p className="mt-3 text-[14px] sm:text-[15px] leading-relaxed" style={{ color: TEXT, opacity: 0.7 }}>
                400+ уроков, практикумы, разборы кабинетов и дополнительные материалы.
              </p>
            </Reveal>

            {/* 02 — Персонализация (accent) */}
            <Reveal className="rounded-[32px] p-8 transition-transform duration-300 hover:-translate-y-1" style={{ backgroundColor: BLUE }} delay={100}>
              <span className="text-[32px] sm:text-[36px] font-bold text-white/40 leading-none">02</span>
              <h3 className="mt-4 text-[18px] sm:text-[20px] font-bold leading-tight text-white">
                Персональный маршрут обучения
              </h3>
              <p className="mt-3 text-[14px] sm:text-[15px] leading-relaxed text-white/85">
                Не нужно самостоятельно выбирать уроки — AI подскажет следующие шаги в обучении.
              </p>
            </Reveal>

            {/* 03 — Живая платформа */}
            <Reveal className="rounded-[32px] p-8 bg-white border border-[#121212]/10 transition-transform duration-300 hover:-translate-y-1" delay={200}>
              <span className="text-[32px] sm:text-[36px] font-bold leading-none" style={{ color: BLUE, opacity: 0.25 }}>03</span>
              <h3 className="mt-4 text-[18px] sm:text-[20px] font-bold leading-tight" style={{ color: TEXT }}>
                Актуальные материалы
              </h3>
              <p className="mt-3 text-[14px] sm:text-[15px] leading-relaxed" style={{ color: TEXT, opacity: 0.7 }}>
                Добавляем новые уроки и учитываем изменения Wildberries и Ozon.
              </p>
            </Reveal>
          </div>
        </div>
      </section>


      {/* ── 6. FAQ ─────────────────────────────────────── */}
      <section id="faq" className="py-[80px] sm:py-[100px] px-6" style={{ backgroundColor: GRAY_BG }}>
        <div className="max-w-[720px] mx-auto">
          <h2 className="text-[28px] sm:text-[36px] font-bold text-center mb-12" style={{ color: TEXT }}>
            Часто задаваемые вопросы
          </h2>
          <div className="rounded-[40px] bg-white p-6 sm:p-10">
            {FAQS.map((faq) => (
              <FaqItem key={faq.q} q={faq.q} a={faq.a} />
            ))}
          </div>
        </div>
      </section>

      {/* ── 7. CTA ─────────────────────────────────────── */}
      <section className="py-[80px] sm:py-[100px] px-6" style={{ backgroundColor: DARK }}>
        <div className="max-w-[600px] mx-auto text-center">
          <h2 className="text-[28px] sm:text-[36px] md:text-[44px] font-bold leading-tight text-white">
            Не знаете, какой тариф выбрать?
          </h2>
          <p className="mt-4 text-[16px] sm:text-[18px] text-white/60 max-w-[440px] mx-auto">
            Пройдите AI-диагностику и получите персональные рекомендации по обучению
          </p>
          <a
            href="/diagnostic"
            className="mt-8 inline-flex items-center justify-center h-[56px] px-10 rounded-full text-[16px] font-medium text-white transition-colors"
            style={{ backgroundColor: BLUE }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = BLUE_HOVER; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = BLUE; }}
          >
            Пройти диагностику
          </a>
        </div>
      </section>

      <V8Footer wrapperBg="dark" />

      <StickyCTA
        href="/skill-test"
        title="Не уверены, какой тариф выбрать?"
        subtitle="AI-диагностика за 10 минут подберет программу под вас."
      />
    </div>
  );
}

/* ── Default export with Suspense wrapper ──────────────── */

export default function PricingPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <div className="animate-spin h-8 w-8 border-4 border-[#2C4FF8] border-t-transparent rounded-full" />
        </div>
      }
    >
      <PricingContent />
    </Suspense>
  );
}
