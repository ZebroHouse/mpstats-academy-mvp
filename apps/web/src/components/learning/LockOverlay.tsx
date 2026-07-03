'use client';

import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface LockOverlayProps {
  lessonTitle: string;
}

export function LockOverlay({ lessonTitle }: LockOverlayProps) {
  return (
    <Card className="shadow-mp-card border-mp-gray-200">
      <CardContent className="py-16 text-center">
        {/* Lock icon */}
        <div className="w-20 h-20 rounded-2xl bg-mp-gray-100 flex items-center justify-center mx-auto mb-6">
          <svg className="w-10 h-10 text-mp-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        </div>
        <h2 className="text-heading text-mp-gray-900 mb-2">
          Урок доступен по подписке
        </h2>
        <p className="text-body text-mp-gray-500 mb-6 max-w-md mx-auto">
          Оформите подписку, чтобы получить доступ к этому и другим урокам
        </p>
        <Link href="/billing">
          <Button size="lg">
            Оформить подписку
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
}
