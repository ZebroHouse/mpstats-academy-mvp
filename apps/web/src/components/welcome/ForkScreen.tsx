'use client';

import { Target, BookOpen } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface ForkScreenProps {
  userName: string | null;
  isSaving: boolean;
  onChoose: (dest: '/diagnostic' | '/learn') => void;
}

/**
 * Final wizard screen — two equal, equivalent path cards.
 * Both call onboarding.complete; navigation happens only after success.
 */
export function ForkScreen({ userName, isSaving, onChoose }: ForkScreenProps) {
  return (
    <div className="space-y-8">
      <div className="space-y-2 text-center">
        <h2 className="text-heading-xl font-bold text-mp-gray-900 sm:text-display-sm">
          {userName
            ? `${userName}, мы готовы помочь вам расти 🚀`
            : 'Мы готовы помочь вам расти 🚀'}
        </h2>
        <p className="text-body text-mp-gray-500">
          Выберите, с чего начать. Оба пути ведут к обучению.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {/* Diagnostic card */}
        <Card className="flex flex-col border-mp-blue-200">
          <CardContent className="flex flex-1 flex-col gap-4 p-6">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-mp-blue-100">
              <Target className="size-6 text-mp-blue-600" />
            </div>
            <div className="space-y-1">
              <h3 className="text-heading-sm font-semibold text-mp-gray-900">
                Пройти диагностику
              </h3>
              <p className="text-body-sm text-mp-gray-600">
                15 вопросов — подберём уроки под ваши проблемные зоны.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="primary">15 вопросов</Badge>
              <Badge variant="primary">10–15 минут</Badge>
              <Badge variant="primary">Персональные рекомендации</Badge>
            </div>
            <Button
              variant="default"
              size="lg"
              className="mt-auto w-full"
              disabled={isSaving}
              onClick={() => onChoose('/diagnostic')}
            >
              {isSaving ? 'Сохраняем…' : 'Пройти диагностику'}
            </Button>
          </CardContent>
        </Card>

        {/* Learning card */}
        <Card className="flex flex-col border-mp-green-200">
          <CardContent className="flex flex-1 flex-col gap-4 p-6">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-mp-green-100">
              <BookOpen className="size-6 text-mp-green-600" />
            </div>
            <div className="space-y-1">
              <h3 className="text-heading-sm font-semibold text-mp-gray-900">
                Перейти в обучение
              </h3>
              <p className="text-body-sm text-mp-gray-600">
                Выберите темы, которые интересны прямо сейчас.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="success">Все курсы</Badge>
              <Badge variant="success">Свой темп</Badge>
              <Badge variant="success">Без теста</Badge>
            </div>
            <Button
              variant="success"
              size="lg"
              className="mt-auto w-full"
              disabled={isSaving}
              onClick={() => onChoose('/learn')}
            >
              {isSaving ? 'Сохраняем…' : 'Перейти в обучение'}
            </Button>
          </CardContent>
        </Card>
      </div>

      <p className="text-center text-body-sm text-mp-gray-500">
        В любой момент можно пройти диагностику или изменить путь в настройках профиля.
      </p>
    </div>
  );
}
