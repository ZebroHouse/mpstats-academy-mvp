'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';

interface PaywallBannerProps {
  remainingFreeCount: number;
}

export function PaywallBanner({ remainingFreeCount }: PaywallBannerProps) {
  return (
    <div className="p-3 bg-mp-blue-50 border border-mp-blue-100 rounded-lg">
      <div className="flex items-center justify-between gap-3">
        <p className="text-body-sm text-mp-gray-700">
          {remainingFreeCount > 0
            ? `Вам доступно ещё ${remainingFreeCount} бесплатных уроков в этом курсе`
            : 'Все бесплатные уроки просмотрены'}
        </p>
        <Link href="/billing">
          <Button variant="outline" size="sm" className="shrink-0">
            Оформить подписку
          </Button>
        </Link>
      </div>
    </div>
  );
}

interface CourseLockBannerProps {
  lockedCount: number;
}

export function CourseLockBanner({ lockedCount }: CourseLockBannerProps) {
  if (lockedCount === 0) return null;

  return (
    <div className="p-3 bg-mp-blue-50/50 border border-mp-blue-100 rounded-lg mt-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-body-sm text-mp-gray-700">
          Ещё {lockedCount} уроков доступны по подписке
        </p>
        <Link href="/billing" className="text-body-sm text-mp-blue-600 hover:text-mp-blue-700 font-medium shrink-0">
          Подробнее
        </Link>
      </div>
    </div>
  );
}
