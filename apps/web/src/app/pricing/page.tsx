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
import { PlanPeriodCards, type PlanIntervalDays } from '@/components/pricing/PlanPeriodCards';
import { PricingFaq } from '@/components/pricing/PricingFaq';
import { WhatsIncluded } from '@/components/pricing/WhatsIncluded';
import { OfferStrip, OFFER_STRIP_HEIGHT } from '@/components/billing/offer/OfferStrip';
import { ReviewsMarquee } from '@/components/billing/offer/ReviewsMarquee';
import { openPaymentWidget } from '@/lib/cloudpayments/widget';
import { reachGoal } from '@/lib/analytics/metrika';
import { METRIKA_GOALS } from '@/lib/analytics/constants';

/** intervalDays (30/90/180) → CloudPayments recurrent `period` (months). */
const RECURRENT_PERIOD_MONTHS: Record<PlanIntervalDays, number> = { 30: 1, 90: 3, 180: 6 };

const onest = Onest({
  subsets: ['latin', 'cyrillic'],
  weight: ['400', '500', '700'],
  display: 'swap',
});

/* ── Brand tokens ──────────────────────────────────────── */
const BLUE = '#2C4FF8';
const BLUE_HOVER = '#1D39C1';
const DARK = '#0F172A';
const GRAY_BG = '#f4f4f4';
const TEXT = '#121212';

/* ── Data ──────────────────────────────────────────────── */

const PROMO_STORAGE_KEY = 'pending_promo_code';

/* ── Page Content ──────────────────────────────────────── */

function PricingContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [widgetReady, setWidgetReady] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const [promoCode, setPromoCode] = useState(searchParams.get('promo') || '');
  const [promoError, setPromoError] = useState('');
  const [discountCode, setDiscountCode] = useState<string | null>(null);
  const [isValidating, setIsValidating] = useState(false);

  // tRPC queries — все tolerant к неавторизованным
  const { data: plans } = trpc.billing.getPlans.useQuery();
  const { data: subscription } = trpc.billing.getSubscription.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  });
  const { data: profile } = trpc.profile.get.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  });
  const isAuthenticated = !!profile;

  const utils = trpc.useUtils();

  // Discount preview — покрывает и введённый discount-код, и pending ambassador-скидку
  // (precedence решает сервер). Discounts only ever apply to the 1-month (30-day)
  // plan (spec §3.5/3.6) — the 3/6-month cards show plain price + volume discount.
  const platformDiscountQuery = trpc.billing.getApplicableDiscount.useQuery(
    { planType: 'PLATFORM', intervalDays: 30, code: discountCode ?? undefined },
    { enabled: isAuthenticated },
  );

  // Trial 2-for-1 offer state (server-authoritative; returns 'none' when the
  // OFFER_ENABLED flag is off, so the strip/offer-mode simply never activate).
  const { data: offerState } = trpc.offer.getState.useQuery(undefined, {
    enabled: isAuthenticated,
    retry: false,
    refetchOnWindowFocus: false,
  });

  // Discount wins over the offer (spec §3.4). platformDiscountQuery already
  // reflects an entered discount code (it re-runs when discountCode changes),
  // so gating on it also handles the "entered a code" case — no getState
  // re-query needed. offerState is server-suppressed for pending ambassador
  // discounts too.
  const offerActive = offerState?.state === 'trial_active' || offerState?.state === 'grace';
  const showOfferMode = Boolean(offerActive && !platformDiscountQuery.data);

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

  // Валидируем код и роутим по типу: discount-код держим для оплаты (НЕ активируем),
  // duration-код идёт в существующий флоу активации.
  const applyPromoCode = async (code: string) => {
    setIsValidating(true);
    try {
      const res = await utils.promo.validate.fetch({ code });
      if (!res.valid) {
        setDiscountCode(null);
        setPromoError(res.error);
        return;
      }
      if (res.kind === 'discount') {
        setPromoError('');
        setDiscountCode(code);
        toast.success('Промокод применён');
        return;
      }
      activatePromo.mutate({ code });
    } catch (err) {
      setPromoError(err instanceof Error ? err.message : 'Не удалось проверить промо-код');
    } finally {
      setIsValidating(false);
    }
  };

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

  // Авто-обработка промо, если юзер пришёл после DOI с ?promo=CODE в URL
  // (через auth/callback?next=/pricing?promo=...). Валидируем и роутим по типу:
  // duration → активация, discount → держим для оплаты. Невалидный код → ошибка
  // в UI, юзер видит форму с уже введённым кодом.
  const promoFromUrl = searchParams.get('promo');
  const [autoActivated, setAutoActivated] = useState(false);
  useEffect(() => {
    if (!autoActivated && isAuthenticated && promoFromUrl && !activatePromo.isPending && !isValidating) {
      setAutoActivated(true);
      void applyPromoCode(promoFromUrl.trim().toUpperCase());
    }
    // applyPromoCode намеренно вне deps — флаг autoActivated гарантирует однократный запуск.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoActivated, isAuthenticated, promoFromUrl, activatePromo, isValidating]);

  const hasActivePlatformSubscription =
    subscription &&
    subscription.plan.type === 'PLATFORM' &&
    ['ACTIVE', 'PAST_DUE'].includes(subscription.status);

  // Buys the PLATFORM plan for the period the user picked on the card
  // (1/3/6 months → intervalDays 30/90/180). The chosen intervalDays flows
  // straight through to initiatePayment and the CP recurrent period below —
  // this is the only source of truth for what gets charged.
  const handlePayment = async (intervalDays: PlanIntervalDays) => {
    setIsProcessing(true);
    try {
      const result = await initiatePayment.mutateAsync({
        planType: 'PLATFORM',
        intervalDays,
        promoCode: discountCode ?? undefined,
      });

      // CP recurrent period is derived from the SAME intervalDays sent to
      // initiatePayment above — 30/90/180 days → 1/3/6 months. Keeps the
      // recurring-charge cadence in lockstep with the purchased plan.
      const success = await openPaymentWidget({
        publicId: process.env.NEXT_PUBLIC_CLOUDPAYMENTS_PUBLIC_ID!,
        description: result.description,
        amount: result.amount,
        currency: 'RUB',
        accountId: result.userId,
        invoiceId: result.subscriptionId,
        recurrent: {
          interval: 'Month',
          period: RECURRENT_PERIOD_MONTHS[intervalDays],
          amount: result.recurrentAmount,
          startDate: result.recurrentStartDate,
          receipt: result.recurrentReceipt,
        },
        receipt: result.receipt,
      });

      if (success) {
        reachGoal(METRIKA_GOALS.PAYMENT, { planType: 'PLATFORM', amount: result.amount, currency: 'RUB' });
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

  const activeIntervalDays = hasActivePlatformSubscription
    ? (subscription!.plan.intervalDays as PlanIntervalDays)
    : undefined;

  const offerContent =
    showOfferMode && offerState ? (
      <div>
        <div className="flex items-baseline gap-2">
          <span className="text-[18px] font-medium text-mp-gray-400 line-through">5 980 ₽</span>
          <span className="text-[32px] sm:text-[36px] font-bold leading-none text-mp-gray-900">2 990 ₽</span>
          <span className="text-[13px] sm:text-[14px] text-mp-gray-500">/ первые 2 месяца</span>
        </div>
        <p className="mt-2 text-[13px] font-semibold text-mp-blue-600">
          {offerState.state === 'grace'
            ? 'Успейте — предложение скоро закроется'
            : 'Предложение действует до конца бесплатного доступа'}
        </p>
        <p className="mt-0.5 text-[12px] text-mp-gray-400">
          С 3-го месяца — 2 990 ₽/мес. Напомним письмом за 3 дня до списания.
        </p>
      </div>
    ) : undefined;

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
    void applyPromoCode(trimmed);
  };

  const promoBusy = activatePromo.isPending || isValidating;

  return (
    <div className={onest.className} style={{ color: TEXT }}>
      <Script
        src="https://widget.cloudpayments.ru/bundles/cloudpayments"
        strategy="lazyOnload"
        onReady={() => setWidgetReady(true)}
      />

      {showOfferMode && offerState && (
        <div className="fixed inset-x-0 top-0 z-[60]">
          <OfferStrip state={offerState.state} endsAt={offerState.offerEndsAt} />
        </div>
      )}
      <V8Header onDarkHero={true} topOffset={showOfferMode ? OFFER_STRIP_HEIGHT : 0} />

      {/* ── 1. Hero (compact) ──────────────────────────── */}
      <section
        className="relative px-6 pb-[40px] sm:pb-[52px]"
        style={{ backgroundColor: DARK, paddingTop: (showOfferMode ? OFFER_STRIP_HEIGHT : 0) + 104 }}
      >
        <div className="max-w-[720px] mx-auto text-center">
          {showOfferMode && (
            <div className="mb-4 inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3.5 py-1.5 text-[13px] font-semibold text-white ring-1 ring-white/15">
              🎁 Только для вас: 2 месяца по цене одного
            </div>
          )}
          <h1 className="text-[28px] sm:text-[36px] md:text-[42px] font-bold leading-[1.12] tracking-tight text-white">
            400+ уроков MPSTATS Academy
            <br />
            за 2 990 ₽ в месяц
          </h1>
          <p className="mt-4 text-[16px] sm:text-[18px] leading-relaxed text-white/70 max-w-[480px] mx-auto">
            Помесячная подписка без оплаты курса целиком. Изучайте материалы платформы, пользуйтесь AI-инструментами и развивайте навыки за фиксированную сумму в месяц
          </p>
        </div>
      </section>

      {/* ── Reviews marquee ─────────────────────────────── */}
      <ReviewsMarquee />

      {/* ── 2. Pricing Cards + promo ────────────────────── */}
      <section id="тарифы" className="pt-[24px] pb-[72px] sm:pt-[32px] sm:pb-[90px] px-6 bg-white">
        <div className="max-w-[1040px] mx-auto">
          <Reveal delay={100}>
            <PlanPeriodCards
              plans={plans}
              onSelect={handlePayment}
              loading={isProcessing || !widgetReady}
              activeIntervalDays={activeIntervalDays}
              discount={platformDiscountQuery.data ?? undefined}
              showOfferMode={showOfferMode}
              offerContent={offerContent}
            />
          </Reveal>

          {/* Promo code — under the cards */}
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
                disabled={promoBusy}
                className="flex-1 min-w-0 h-[48px] sm:h-[52px] px-5 rounded-full border border-[#121212]/10 text-[14px] sm:text-[15px] font-medium outline-none transition-colors focus:border-[#2C4FF8] disabled:opacity-60"
                style={{ color: TEXT, backgroundColor: '#fff' }}
              />
              <button
                onClick={handlePromoApply}
                disabled={promoBusy || !promoCode.trim()}
                className="flex-shrink-0 h-[48px] sm:h-[52px] px-6 sm:px-7 rounded-full text-[14px] sm:text-[15px] font-medium text-white transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                style={{ backgroundColor: BLUE }}
                onMouseEnter={(e) => { if (!e.currentTarget.disabled) e.currentTarget.style.backgroundColor = BLUE_HOVER; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = BLUE; }}
              >
                {promoBusy ? 'Проверка...' : 'Применить'}
              </button>
            </div>
            {promoError && (
              <p className="mt-3 text-center text-[13px]" style={{ color: '#dc2626' }}>{promoError}</p>
            )}
          </div>
        </div>
      </section>

      {/* ── 3. What's included ──────────────────────────── */}
      <section id="что-входит" className="py-[80px] sm:py-[100px] px-6 bg-white">
        <Reveal>
          <WhatsIncluded />
        </Reveal>
      </section>

      {/* ── 4. FAQ ───────────────────────────────────────── */}
      <section id="faq" className="py-[80px] sm:py-[100px] px-6" style={{ backgroundColor: GRAY_BG }}>
        <div className="max-w-[720px] mx-auto">
          <PricingFaq />
        </div>
      </section>

      {/* ── 5. CTA ───────────────────────────────────────── */}
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
