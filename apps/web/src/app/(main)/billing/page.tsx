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
import { DiscountedPrice } from '@/components/pricing/DiscountedPrice';
import { trpc } from '@/lib/trpc/client';
import { openPaymentWidget } from '@/lib/cloudpayments/widget';
import { reachGoal } from '@/lib/analytics/metrika';
import { METRIKA_GOALS } from '@/lib/analytics/constants';
import { cn } from '@/lib/utils';

const COURSE_FEATURES = ['Все материалы курса', 'AI-ассистент', 'Персональный план обучения'];
const PLATFORM_FEATURES = [
  'Все 4 курса платформы',
  '400+ уроков, 150+ часов контента',
  'AI-диагностика',
  'AI-ассистент',
  'Персональный план обучения',
  'Новые материалы и обновления',
];
const COURSE_SHORT_LABEL: Record<string, string> = {
  '01_analytics': 'Аналитика',
  '02_ads': 'Реклама WB',
  '03_ai': 'Нейросети',
  '05_ozon': 'Ozon',
};
const PROMO_STORAGE_KEY = 'pending_promo_code';

function Check({ light }: { light?: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={light ? '#fff' : '#2C4FF8'} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function formatPrice(price?: number): string {
  if (typeof price !== 'number') return '—';
  return `${price.toLocaleString('ru-RU')} ₽`;
}

function BillingContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [widgetReady, setWidgetReady] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedCourseId, setSelectedCourseId] = useState('');
  const [promoCode, setPromoCode] = useState(searchParams.get('promo') || '');
  const [promoError, setPromoError] = useState('');
  const [discountCode, setDiscountCode] = useState<string | null>(null);
  const [isValidating, setIsValidating] = useState(false);

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

  const utils = trpc.useUtils();

  // Discount preview — covers both an entered discount code and a pending
  // ambassador discount (server decides precedence). Runs with code undefined
  // so a referred user sees their ambassador discount without typing anything.
  const courseDiscountQuery = trpc.billing.getApplicableDiscount.useQuery(
    { planType: 'COURSE', code: discountCode ?? undefined },
    { enabled: isAuthenticated },
  );
  const platformDiscountQuery = trpc.billing.getApplicableDiscount.useQuery(
    { planType: 'PLATFORM', code: discountCode ?? undefined },
    { enabled: isAuthenticated },
  );

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

  const coursePlan = plans?.find((p) => p.type === 'COURSE');
  const platformPlan = plans?.find((p) => p.type === 'PLATFORM');

  const courseOptions = (courses || [])
    .filter((c) => COURSE_SHORT_LABEL[c.id])
    .map((c) => ({ id: c.id, name: COURSE_SHORT_LABEL[c.id] }));

  useEffect(() => {
    if (!selectedCourseId && courseOptions.length > 0) setSelectedCourseId(courseOptions[0].id);
  }, [courseOptions, selectedCourseId]);

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
        promoCode: discountCode ?? undefined,
      });
      const success = await openPaymentWidget({
        publicId: process.env.NEXT_PUBLIC_CLOUDPAYMENTS_PUBLIC_ID!,
        description: result.description,
        amount: result.amount,
        currency: 'RUB',
        accountId: result.userId,
        invoiceId: result.subscriptionId,
        recurrent: { interval: 'Month', period: 1, startDate: result.recurrentStartDate, amount: result.recurrentAmount, receipt: result.recurrentReceipt },
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

  const courseBtnDisabled = Boolean(isProcessing || !widgetReady || !selectedCourseId || hasActiveCourseSubscription);
  const platformBtnDisabled = Boolean(isProcessing || !widgetReady || hasActivePlatformSubscription);

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
          Помесячная подписка — выберите доступ к одному курсу или ко всей платформе
        </p>
      </div>

      {/* Plan cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 animate-slide-up" style={{ animationDelay: '50ms' }}>
        {/* COURSE */}
        <div className="rounded-2xl border border-mp-gray-200 bg-white shadow-mp-card p-6 sm:p-8 flex flex-col">
          <h2 className="text-heading-lg font-bold text-mp-gray-900">Подписка на курс</h2>
          {courseDiscountQuery.data ? (
            <div className="mt-3">
              <DiscountedPrice discount={courseDiscountQuery.data} onDark={false} />
            </div>
          ) : (
            <div className="mt-3 flex items-baseline gap-1">
              <span className="text-[36px] font-bold leading-none text-mp-gray-900">{formatPrice(coursePlan?.price)}</span>
              <span className="text-body-sm text-mp-gray-400">/мес</span>
            </div>
          )}

          <div className="mt-5">
            <p className="text-caption font-medium uppercase tracking-wider text-mp-gray-400 mb-2">Выберите курс</p>
            <div className="flex flex-wrap gap-2">
              {courseOptions.length === 0 ? (
                <span className="text-body-sm text-mp-gray-400">Загрузка…</span>
              ) : (
                courseOptions.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setSelectedCourseId(c.id)}
                    className={cn(
                      'px-4 py-1.5 rounded-full text-body-sm font-medium transition-colors',
                      selectedCourseId === c.id
                        ? 'bg-mp-blue-500 text-white'
                        : 'bg-mp-gray-100 text-mp-gray-700 hover:bg-mp-gray-200',
                    )}
                  >
                    {c.name}
                  </button>
                ))
              )}
            </div>
          </div>

          <ul className="mt-6 flex flex-col gap-3 flex-1">
            {COURSE_FEATURES.map((f) => (
              <li key={f} className="flex items-center gap-3">
                <Check />
                <span className="text-body-sm text-mp-gray-700">{f}</span>
              </li>
            ))}
          </ul>

          <button
            onClick={() => handlePayment('COURSE')}
            disabled={courseBtnDisabled}
            className="mt-7 inline-flex items-center justify-center h-12 rounded-full text-body font-medium border-2 border-mp-blue-500 text-mp-blue-500 bg-transparent hover:bg-mp-blue-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {hasActiveCourseSubscription ? 'Текущий план' : isProcessing ? 'Обработка…' : 'Оформить подписку'}
          </button>
        </div>

        {/* PLATFORM */}
        <div className="rounded-2xl p-6 sm:p-8 flex flex-col relative overflow-hidden bg-mp-blue-500 text-white">
          <span className="absolute top-5 right-5 px-3 py-1 rounded-full text-caption font-medium text-white" style={{ backgroundColor: '#ff6b16' }}>
            Рекомендуем
          </span>
          <h2 className="text-heading-lg font-bold text-white">Полный доступ</h2>
          {platformDiscountQuery.data ? (
            <div className="mt-3">
              <DiscountedPrice discount={platformDiscountQuery.data} onDark={true} />
            </div>
          ) : (
            <div className="mt-3 flex items-baseline gap-1">
              <span className="text-[36px] font-bold leading-none text-white">{formatPrice(platformPlan?.price)}</span>
              <span className="text-body-sm text-white/50">/мес</span>
            </div>
          )}

          <ul className="mt-6 flex flex-col gap-3 flex-1">
            {PLATFORM_FEATURES.map((f) => (
              <li key={f} className="flex items-center gap-3">
                <Check light />
                <span className="text-body-sm text-white/85">{f}</span>
              </li>
            ))}
          </ul>

          <button
            onClick={() => handlePayment('PLATFORM')}
            disabled={platformBtnDisabled}
            className="mt-7 inline-flex items-center justify-center h-12 rounded-full text-body font-medium bg-white text-mp-blue-600 hover:bg-mp-gray-100 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {hasActivePlatformSubscription ? 'Текущий план' : isProcessing ? 'Обработка…' : 'Оформить подписку'}
          </button>
        </div>
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
