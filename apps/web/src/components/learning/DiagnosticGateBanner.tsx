'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Sparkles, X } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

const DISMISS_KEY = 'diagnosticHintDismissed';

/**
 * Ненавязчивая закрываемая хинт-карточка диагностики над плеером урока.
 * НЕ блокирует видео. Показывается только пока пользователь не прошёл
 * диагностику и не закрыл подсказку. Dismissal хранится в localStorage.
 */
export function DiagnosticGateBanner() {
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    setDismissed(localStorage.getItem(DISMISS_KEY) === 'true');
  }, []);

  if (dismissed) {
    return null;
  }

  const handleDismiss = () => {
    localStorage.setItem(DISMISS_KEY, 'true');
    setDismissed(true);
  };

  return (
    <Card className="border-l-4 border-mp-blue-500 bg-mp-blue-50 p-4">
      <div className="flex items-start gap-3">
        <Sparkles className="mt-0.5 size-5 shrink-0 text-mp-blue-600" />
        <div className="flex-1 space-y-1">
          <h3 className="text-heading-sm text-mp-gray-900">
            Пройди диагностику — соберём персональный трек
          </h3>
          <p className="text-body-sm text-mp-gray-600">
            Точная карта навыков и уроки под ваши слабые места.
          </p>
          <Button asChild variant="link" size="sm" className="h-auto px-0">
            <Link href="/diagnostic">Пройти →</Link>
          </Button>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleDismiss}
          aria-label="Закрыть подсказку"
          className="shrink-0 text-mp-gray-500"
        >
          <X className="size-4" />
        </Button>
      </div>
    </Card>
  );
}
