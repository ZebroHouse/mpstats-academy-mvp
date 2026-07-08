'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { signUp, signInWithYandex, signInWithTochka } from '@/lib/auth/actions';
import { TochkaButton } from '@/components/auth/TochkaButton';
import { reachGoal } from '@/lib/analytics/metrika';
import { METRIKA_GOALS } from '@/lib/analytics/constants';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { PhoneInput } from '@/components/ui/phone-input';
import { trpc } from '@/lib/trpc/client';
import { pluralizeDays } from '@/lib/plural';

export function RegisterForm({ initialRefCode, tochkaEnabled }: { initialRefCode: string | null; tochkaEnabled?: boolean }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [phone, setPhone] = useState('');
  const [acceptOffer, setAcceptOffer] = useState(false);
  const [acceptPdn, setAcceptPdn] = useState(false);
  const [acceptAdv, setAcceptAdv] = useState(false);

  const canSubmit = acceptOffer && acceptPdn && !loading;

  const loginHref = `/login${searchParams.toString() ? `?${searchParams.toString()}` : ''}`;

  const promoFromUrl = searchParams.get('promo') || '';

  const refCode = initialRefCode;
  const refValidation = trpc.referral.validateCode.useQuery(
    { code: refCode! },
    { enabled: !!refCode },
  );
  const i2Mode = process.env.NEXT_PUBLIC_REFERRAL_PAY_GATED === 'true';
  // Phase 60: ambassador codes carry their own duration in validation response.
  // Fall back to the 53A i1/i2 constants when the endpoint returns null trialDays
  // (legacy user-to-user codes).
  const trialDays = refValidation.data?.trialDays ?? (i2Mode ? 7 : 14);
  const isAmbassador = refValidation.data?.type === 'ambassador';

  async function handleSubmit(formData: FormData) {
    setLoading(true);
    setError(null);

    const password = formData.get('password') as string;
    const confirmPassword = formData.get('confirmPassword') as string;

    if (password !== confirmPassword) {
      setError('Пароли не совпадают');
      setLoading(false);
      return;
    }

    formData.set('adv_consent', acceptAdv ? 'true' : 'false');
    const result = await signUp(formData);

    if (result?.error) {
      setError(result.error);
      setLoading(false);
    } else if (result?.success) {
      reachGoal(METRIKA_GOALS.SIGNUP, { method: 'email' });
      router.push('/verify');
    }
  }

  async function handleYandexSignIn() {
    setLoading(true);
    setError(null);

    reachGoal(METRIKA_GOALS.SIGNUP, { method: 'yandex' });
    const result = await signInWithYandex();

    if (result?.error) {
      setError(result.error);
      setLoading(false);
    }
  }

  async function handleTochkaSignIn() {
    setLoading(true);
    setError(null);

    reachGoal(METRIKA_GOALS.SIGNUP, { method: 'tochka' });
    const result = await signInWithTochka();

    if (result?.error) {
      setError(result.error);
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-2xl">Создать аккаунт</CardTitle>
        <CardDescription>
          Зарегистрируйтесь для начала обучения
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {refValidation.data?.valid && (
          <div className="rounded-lg border border-mp-blue-300 bg-mp-blue-50 p-4 mb-4 text-sm">
            <div className="font-semibold text-mp-gray-900">
              🎁 Тебе подарили {trialDays} {pluralizeDays(trialDays)} бесплатного доступа к Платформе
            </div>
            {refValidation.data.referrerName && (
              <div className="text-mp-gray-600 mt-1">
                {isAmbassador ? (
                  <>
                    По приглашению <strong>{refValidation.data.referrerName}</strong>
                  </>
                ) : (
                  <>
                    От пользователя: <strong>{refValidation.data.referrerName}</strong>
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {error && (
          <div className="p-3 rounded-md bg-red-50 text-red-600 text-sm">
            {error}
          </div>
        )}

        <form action={handleSubmit} className="space-y-4">
          {promoFromUrl && (
            <input type="hidden" name="promo" value={promoFromUrl} />
          )}
          <div className="space-y-2">
            <label htmlFor="name" className="text-sm font-medium">
              Имя <span className="text-red-500">*</span>
            </label>
            <Input
              id="name"
              name="name"
              type="text"
              placeholder="Иван Иванов"
              required
              disabled={loading}
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="email" className="text-sm font-medium">
              Email <span className="text-red-500">*</span>
            </label>
            <Input
              id="email"
              name="email"
              type="email"
              placeholder="your@email.com"
              required
              disabled={loading}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">
              Телефон <span className="text-red-500">*</span>
            </label>
            <PhoneInput
              value={phone}
              onChange={setPhone}
              disabled={loading}
            />
            <input type="hidden" name="phone" value={phone} />
          </div>

          <div className="space-y-2">
            <label htmlFor="password" className="text-sm font-medium">
              Пароль <span className="text-red-500">*</span>
            </label>
            <Input
              id="password"
              name="password"
              type="password"
              placeholder="Минимум 8 символов"
              required
              minLength={8}
              disabled={loading}
            />
            <p className="text-xs text-gray-500 leading-tight">
              Минимум 8 символов. Цифры и спецсимволы по желанию.
            </p>
          </div>

          <div className="space-y-2">
            <label htmlFor="confirmPassword" className="text-sm font-medium">
              Подтвердите пароль <span className="text-red-500">*</span>
            </label>
            <Input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              placeholder="Повторите пароль"
              required
              minLength={8}
              disabled={loading}
            />
          </div>

          <div className="space-y-3 pt-2">
            <label className="flex items-start gap-2 cursor-pointer">
              <Checkbox
                checked={acceptOffer}
                onCheckedChange={(v) => setAcceptOffer(v === true)}
                disabled={loading}
                className="mt-0.5"
              />
              <span className="text-sm text-gray-600 leading-tight">
                Я принимаю условия{' '}
                <Link href="/legal/offer" target="_blank" className="text-blue-600 hover:underline">
                  оферты
                </Link>
                <span className="text-red-500 ml-0.5">*</span>
              </span>
            </label>

            <label className="flex items-start gap-2 cursor-pointer">
              <Checkbox
                checked={acceptPdn}
                onCheckedChange={(v) => setAcceptPdn(v === true)}
                disabled={loading}
                className="mt-0.5"
              />
              <span className="text-sm text-gray-600 leading-tight">
                Я согласен на{' '}
                <Link href="/legal/pdn" target="_blank" className="text-blue-600 hover:underline">
                  обработку персональных данных
                </Link>
                <span className="text-red-500 ml-0.5">*</span>
              </span>
            </label>

            <label className="flex items-start gap-2 cursor-pointer">
              <Checkbox
                checked={acceptAdv}
                onCheckedChange={(v) => setAcceptAdv(v === true)}
                disabled={loading}
                className="mt-0.5"
              />
              <span className="text-sm text-gray-600 leading-tight">
                Я согласен на получение{' '}
                <Link href="/legal/adv" target="_blank" className="text-blue-600 hover:underline">
                  рекламных материалов
                </Link>
              </span>
            </label>

            <p className="text-xs text-gray-400">
              <span className="text-red-500">*</span> — обязательные поля
            </p>
          </div>

          <Button type="submit" className="w-full" disabled={!canSubmit}>
            {loading ? 'Регистрация...' : 'Зарегистрироваться'}
          </Button>
        </form>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-white px-2 text-gray-500">или</span>
          </div>
        </div>

        <Button
          variant="outline"
          className="w-full"
          onClick={handleYandexSignIn}
          disabled={loading}
        >
          <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="12" fill="#FC3F1D"/>
            <path d="M13.63 7.18h-.92c-1.53 0-2.33.84-2.33 2.08 0 1.39.6 2.16 1.82 3.05l1 .73-2.92 4.96H8.73l2.6-4.38c-1.52-1.15-2.35-2.28-2.35-3.95 0-2.16 1.47-3.49 3.87-3.49h2.28V18h-1.5V7.18z" fill="white"/>
          </svg>
          Продолжить с Яндекс ID
        </Button>

        {tochkaEnabled && <TochkaButton onClick={handleTochkaSignIn} disabled={loading} />}
      </CardContent>

      <CardFooter className="justify-center">
        <p className="text-sm text-gray-600">
          Уже есть аккаунт?{' '}
          <Link href={loginHref} className="text-blue-600 hover:underline font-medium">
            Войти
          </Link>
        </p>
      </CardFooter>
    </Card>
  );
}
