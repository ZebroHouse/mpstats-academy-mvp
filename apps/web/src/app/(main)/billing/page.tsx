'use client';

/**
 * In-product pricing (v2 reskin). Renders INSIDE the (main) shell (sidebar +
 * light canvas) instead of bouncing logged-in users out to the marketing
 * `/pricing` page. Lean: plan cards + promo + CloudPayments purchase only —
 * reuses the exact billing flow from /pricing (initiatePayment → openPaymentWidget,
 * promo.activate). The public marketing /pricing stays for unauthenticated users.
 */

import { Suspense, useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Script from 'next/script';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { PlanPeriodCards, type PlanIntervalDays } from '@/components/pricing/PlanPeriodCards';
import { PricingFaq } from '@/components/pricing/PricingFaq';
import { WhatsIncluded } from '@/components/pricing/WhatsIncluded';
import { ReviewsMarquee } from '@/components/billing/offer/ReviewsMarquee';
import { trpc } from '@/lib/trpc/client';
import { openPaymentWidget } from '@/lib/cloudpayments/widget';
import { reachGoal } from '@/lib/analytics/metrika';
import { METRIKA_GOALS } from '@/lib/analytics/constants';

const PROMO_STORAGE_KEY = 'pending_promo_code';

/** intervalDays (30/90/180) → CloudPayments recurrent `period` (months). */
const RECURRENT_PERIOD_MONTHS: Record<PlanIntervalDays, number> = { 30: 1, 90: 3, 180: 6 };

function BillingContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [widgetReady, setWidgetReady] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [promoCode, setPromoCode] = useState(searchParams.get('promo') || '');
  const [promoError, setPromoError] = useState('');
  const [discountCode, setDiscountCode] = useState<string | null>(null);
  const [isValidating, setIsValidating] = useState(false);

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

  // Discount preview — covers both an entered discount code and a pending
  // ambassador discount (server decides precedence). Runs with code undefined
  // so a referred user sees their ambassador discount without typing anything.
  // Discount TYPE+VALUE is period-agnostic — resolved once here off the
  // 30-day plan, then PlanPeriodCards applies it to EACH card's own
  // plan.price (discounts compound on all three tiers, first payment only;
  // the 2-for-1 trial offer stays 1-month-only and is not a discount).
  const platformDiscountQuery = trpc.billing.getApplicableDiscount.useQuery(
    { planType: 'PLATFORM', intervalDays: 30, code: discountCode ?? undefined },
    { enabled: isAuthenticated },
  );

  // Trial 2-for-1 offer state (server-authoritative; returns 'none' when the
  // OFFER_ENABLED flag is off). Discount wins client-side (spec §3.4) — same
  // gating as /pricing. The sticky offer banner (from the (main) layout) sits
  // above this page; here we reflect the offer in the 1-month card price.
  const { data: offerState } = trpc.offer.getState.useQuery(undefined, {
    enabled: isAuthenticated,
    retry: false,
    refetchOnWindowFocus: false,
  });
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

  // Validate the code and route by kind: a discount code is held for payment
  // (NOT activated), a duration code goes through the existing activation flow.
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

  useEffect(() => {
    reachGoal(METRIKA_GOALS.PRICING_VIEW);
  }, []);

  // Auto-apply promo arriving via ?promo= (e.g. (main) salvage redirect).
  // Route through applyPromoCode so a discount code lands in discountCode
  // (held for payment) instead of being activated as a duration code.
  const promoFromUrl = searchParams.get('promo');
  const [autoActivated, setAutoActivated] = useState(false);
  useEffect(() => {
    if (!autoActivated && isAuthenticated && promoFromUrl && !activatePromo.isPending && !isValidating) {
      setAutoActivated(true);
      void applyPromoCode(promoFromUrl.trim().toUpperCase());
    }
    // applyPromoCode intentionally out of deps — autoActivated guards single run.
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
          startDate: result.recurrentStartDate,
          amount: result.recurrentAmount,
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
        setTimeout(() => router.push('/register?redirect=/billing'), 1500);
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
    void applyPromoCode(trimmed);
  };

  const promoBusy = activatePromo.isPending || isValidating;

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

  return (
    <div className="space-y-6 animate-fade-in">
      <Script
        src="https://widget.cloudpayments.ru/bundles/cloudpayments"
        strategy="lazyOnload"
        onReady={() => setWidgetReady(true)}
      />

      {/* Header */}
      <div className="animate-slide-up">
        <h1 className="text-display-sm text-mp-gray-900">Тарифы</h1>
        <p className="text-body text-mp-gray-500 mt-1">
          Полный доступ ко всей платформе — выберите период оплаты
        </p>
      </div>

      {/* Plan cards */}
      <div className="animate-slide-up" style={{ animationDelay: '50ms' }}>
        <PlanPeriodCards
          plans={plans}
          onSelect={handlePayment}
          loading={isProcessing || !widgetReady}
          activeIntervalDays={activeIntervalDays}
          discount={platformDiscountQuery.data ?? undefined}
          showOfferMode={showOfferMode}
          offerContent={offerContent}
        />
      </div>

      {/* Promo */}
      <div className="mx-auto w-full max-w-[420px] animate-slide-up" style={{ animationDelay: '100ms' }}>
        <p className="text-center text-caption font-medium uppercase tracking-wider text-mp-gray-400 mb-2">Есть промокод?</p>
        <div className="flex items-stretch gap-2">
          <Input
            value={promoCode}
            onChange={(e) => {
              setPromoCode(e.target.value.toUpperCase());
              if (promoError) setPromoError('');
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handlePromoApply();
            }}
            placeholder="Введите промокод"
            disabled={promoBusy}
            error={Boolean(promoError)}
          />
          <button
            onClick={handlePromoApply}
            disabled={promoBusy || !promoCode.trim()}
            className="flex-shrink-0 h-11 px-6 rounded-full text-body-sm font-medium text-white bg-mp-blue-500 hover:bg-mp-blue-600 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {promoBusy ? 'Проверка…' : 'Применить'}
          </button>
        </div>
        {promoError && <p className="mt-2 text-center text-body-sm text-red-600">{promoError}</p>}
      </div>

      {/* Reviews — parity with /pricing (spec §3.4a) */}
      <div className="animate-slide-up" style={{ animationDelay: '150ms' }}>
        <ReviewsMarquee />
      </div>

      {/* What's included */}
      <div className="animate-slide-up" style={{ animationDelay: '200ms' }}>
        <WhatsIncluded />
      </div>

      {/* FAQ */}
      <div className="animate-slide-up" style={{ animationDelay: '250ms' }}>
        <PricingFaq />
      </div>
    </div>
  );
}

export default function BillingPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-mp-gray-400">Загрузка…</div>}>
      <BillingContent />
    </Suspense>
  );
}
