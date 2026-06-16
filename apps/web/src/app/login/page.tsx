'use client';

import { useState, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { signIn, signInWithYandex } from '@/lib/auth/actions';
import { reachGoal } from '@/lib/analytics/metrika';
import { METRIKA_GOALS } from '@/lib/analytics/constants';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';

function LoginForm() {
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(
    searchParams.get('error') === 'auth_callback_error'
      ? 'Ошибка авторизации. Попробуйте ещё раз.'
      : null
  );
  const [loading, setLoading] = useState(false);

  async function handleSubmit(formData: FormData) {
    setLoading(true);
    setError(null);

    reachGoal(METRIKA_GOALS.LOGIN, { method: 'email' });
    const result = await signIn(formData);

    if (result?.error) {
      setError(result.error);
      setLoading(false);
      return;
    }

    if (result?.success) {
      // Hard reload чтобы пересоздать React Query cache — иначе новому
      // юзеру показывались бы данные предыдущего из памяти TanStack.
      window.location.href = '/dashboard';
    }
  }

  async function handleYandexSignIn() {
    setLoading(true);
    setError(null);

    reachGoal(METRIKA_GOALS.LOGIN, { method: 'yandex' });
    const result = await signInWithYandex();

    if (result?.error) {
      setError(result.error);
      setLoading(false);
    }
  }

  return (
    <Card variant="elevated" className="shadow-mp-card">
      <CardHeader className="text-center">
        <CardTitle className="text-display-sm text-mp-gray-900">Вход в аккаунт</CardTitle>
        <CardDescription className="text-body text-mp-gray-500">
          Введите email и пароль для входа
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {error && (
          <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-600 text-body-sm">
            {error}
          </div>
        )}

        <form action={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="email" className="text-body-sm font-medium text-mp-gray-700">
              Email
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
            <div className="flex items-center justify-between">
              <label htmlFor="password" className="text-body-sm font-medium text-mp-gray-700">
                Пароль
              </label>
              <Link
                href="/forgot-password"
                className="text-body-sm text-mp-blue-600 hover:text-mp-blue-700 hover:underline"
              >
                Забыли пароль?
              </Link>
            </div>
            <Input
              id="password"
              name="password"
              type="password"
              placeholder="********"
              required
              disabled={loading}
            />
          </div>

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Вход...' : 'Войти'}
          </Button>
        </form>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-mp-gray-200" />
          </div>
          <div className="relative flex justify-center text-caption uppercase">
            <span className="bg-white px-2 text-mp-gray-400">или</span>
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
          Войти с Яндекс ID
        </Button>
      </CardContent>

      <CardFooter className="justify-center">
        <p className="text-body-sm text-mp-gray-600">
          Нет аккаунта?{' '}
          <Link href="/register" className="text-mp-blue-600 hover:text-mp-blue-700 hover:underline font-medium">
            Зарегистрироваться
          </Link>
        </p>
      </CardFooter>
    </Card>
  );
}

export default function LoginPage() {
  // Form floats as a white card, centred on the dark register/login canvas.
  return (
    <div className="mx-auto flex min-h-[68vh] w-full max-w-md flex-col justify-center px-4 py-12 lg:py-16">
      <Suspense fallback={<div className="animate-pulse text-white/40">Загрузка...</div>}>
        <LoginForm />
      </Suspense>
    </div>
  );
}
