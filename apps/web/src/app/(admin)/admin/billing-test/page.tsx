'use client';

import { useState } from 'react';
import Script from 'next/script';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { trpc } from '@/lib/trpc/client';
import { openPaymentWidget } from '@/lib/cloudpayments/widget';
import { toast } from 'sonner';
import { AlertTriangle } from 'lucide-react';

/**
 * SUPERADMIN-only page to run production CloudPayments smoke tests
 * against hidden plans (10₽/1 day). Not linked from the sidebar.
 *
 * Flow: pick hidden plan → initiateTestPayment → open CP widget with
 * recurrent Day/1 → verify pay webhook + recurrent webhook next day.
 */
export default function AdminBillingTestPage() {
  const [widgetReady, setWidgetReady] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);

  const plans = trpc.billing.listTestPlans.useQuery();
  const initiate = trpc.billing.initiateTestPayment.useMutation();

  const handlePay = async (planId: string) => {
    if (!widgetReady) {
      toast.error('Виджет CP ещё не загрузился');
      return;
    }

    setProcessingId(planId);
    try {
      const result = await initiate.mutateAsync({ planId });

      const success = await openPaymentWidget({
        publicId: process.env.NEXT_PUBLIC_CLOUDPAYMENTS_PUBLIC_ID!,
        description: result.description,
        amount: result.amount,
        currency: 'RUB',
        accountId: result.userId,
        invoiceId: result.subscriptionId,
        recurrent: { interval: 'Day', period: 1, amount: result.amount },
        receipt: result.receipt,
      });

      if (success) {
        toast.success('Оплата прошла', {
          description: `Подписка ${result.subscriptionId.slice(0, 12)}… активируется по webhook`,
        });
      } else {
        toast.error('Оплата не прошла или отменена');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Ошибка');
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <>
      <Script
        src="https://widget.cloudpayments.ru/bundles/cloudpayments"
        strategy="lazyOnload"
        onReady={() => setWidgetReady(true)}
      />

      <div className="space-y-6 animate-fade-in max-w-4xl">
        <div>
          <h2 className="text-heading-lg font-bold text-mp-gray-900">
            Billing Test (SUPERADMIN)
          </h2>
          <p className="text-body-sm text-mp-gray-500 mt-1">
            Скрытые тестовые тарифы для проверки боевого CloudPayments. Не
            показывается на /pricing и в сайдбаре.
          </p>
        </div>

        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="pt-6">
            <div className="flex gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="text-body-sm text-amber-900 space-y-1">
                <p className="font-medium">Внимание: реальные деньги</p>
                <p>
                  Оплата идёт через боевой CP с реальной карты (если ключи
                  переключены в prod). Recurrent={' '}
                  <code className="font-mono">Day / period=1</code> — следующее
                  списание через ~24 часа. Не забудь отменить подписку после
                  теста через /profile, иначе будут ежедневные списания.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-heading-md">
              Доступные тестовые планы
            </CardTitle>
          </CardHeader>
          <CardContent>
            {plans.isLoading ? (
              <p className="text-mp-gray-500">Загрузка...</p>
            ) : plans.error ? (
              <div className="text-red-600">
                <p className="font-medium">Ошибка загрузки</p>
                <p className="text-body-sm mt-1">{plans.error.message}</p>
              </div>
            ) : !plans.data?.length ? (
              <div className="text-mp-gray-500 space-y-2">
                <p>Нет скрытых планов в БД.</p>
                <p className="text-body-sm">
                  Создай план через SQL:
                </p>
                <pre className="text-xs bg-mp-gray-100 p-3 rounded overflow-x-auto">{`INSERT INTO "SubscriptionPlan"
  (id, type, name, price, "intervalDays", hidden, "isActive", "createdAt", "updatedAt")
VALUES
  (gen_random_uuid()::text, 'PLATFORM', 'TEST — 1 день (10₽)',
   10, 1, true, true, now(), now());`}</pre>
              </div>
            ) : (
              <div className="space-y-3">
                {plans.data.map((plan) => (
                  <div
                    key={plan.id}
                    className="flex items-center justify-between border border-mp-gray-200 rounded-lg p-4"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-mp-gray-900">
                          {plan.name}
                        </span>
                        <Badge variant="default">{plan.type}</Badge>
                        {!plan.isActive && (
                          <Badge variant="destructive">Inactive</Badge>
                        )}
                      </div>
                      <div className="text-body-sm text-mp-gray-500">
                        {plan.price} ₽ · {plan.intervalDays}{' '}
                        {plan.intervalDays === 1 ? 'день' : 'дн.'} · id=
                        <code className="font-mono">
                          {plan.id.slice(0, 12)}…
                        </code>
                      </div>
                    </div>
                    <Button
                      onClick={() => handlePay(plan.id)}
                      disabled={
                        !widgetReady ||
                        !plan.isActive ||
                        processingId === plan.id
                      }
                    >
                      {processingId === plan.id
                        ? 'Обработка...'
                        : `Оплатить ${plan.price} ₽`}
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
