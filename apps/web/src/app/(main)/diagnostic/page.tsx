'use client';

import { useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { trpc } from '@/lib/trpc/client';
import { DiagnosticSummary } from '@/components/diagnostic/DiagnosticSummary';

const SKILL_CATEGORIES = [
  {
    name: 'Аналитика',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
    bgColor: 'bg-mp-blue-100',
    textColor: 'text-mp-blue-600',
    description: 'Работа с данными, MPSTATS, ABC-анализ',
  },
  {
    name: 'Маркетинг',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z" />
      </svg>
    ),
    bgColor: 'bg-mp-green-100',
    textColor: 'text-mp-green-600',
    description: 'Реклама, продвижение, акции',
  },
  {
    name: 'Контент',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    ),
    bgColor: 'bg-mp-gray-100',
    textColor: 'text-mp-gray-600',
    description: 'Карточки товаров, фото, видео',
  },
  {
    name: 'Операции',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
      </svg>
    ),
    bgColor: 'bg-mp-blue-50',
    textColor: 'text-mp-blue-500',
    description: 'Логистика, склад, FBO/FBS',
  },
  {
    name: 'Финансы',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    bgColor: 'bg-mp-green-100',
    textColor: 'text-mp-green-600',
    description: 'Unit-экономика, маржа, ROI',
  },
];

export default function DiagnosticPage() {
  const router = useRouter();
  const [isStarting, setIsStarting] = useState(false);
  const [loadingStage, setLoadingStage] = useState<string | null>(null);
  const timersRef = useRef<NodeJS.Timeout[]>([]);

  const clearTimers = useCallback(() => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
  }, []);

  const { data: skillProfile, isLoading: profileLoading } = trpc.profile.getSkillProfile.useQuery();
  const hasPriorResult = !!skillProfile;

  const startSession = trpc.diagnostic.startSession.useMutation({
    onSuccess: (data) => {
      clearTimers();
      router.push(`/diagnostic/session?id=${data.id}`);
    },
    onError: (error) => {
      clearTimers();
      console.error('Failed to start session:', error);
      setIsStarting(false);
      setLoadingStage(null);
    },
  });

  const handleStart = () => {
    setIsStarting(true);
    setLoadingStage('Подготовка вопросов...');

    // Progressive hints for slower loads (bank miss = AI generation)
    const t1 = setTimeout(() => setLoadingStage('Подбираем вопросы по вашему уровню...'), 2000);
    const t2 = setTimeout(() => setLoadingStage('AI формирует персональный набор...'), 5000);
    const t3 = setTimeout(() => setLoadingStage('Почти готово, ещё немного...'), 10000);
    timersRef.current = [t1, t2, t3];

    startSession.mutate();
  };

  // Prevent flash of "first time" UI while we load whether there's a prior result.
  if (profileLoading) {
    return (
      <div className="max-w-4xl mx-auto py-12 flex justify-center">
        <svg className="animate-spin h-8 w-8 text-mp-blue-500" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-fade-in">
      {/* Summary for users who already passed — surfaces last result + weak blocks */}
      {hasPriorResult && skillProfile && (
        <DiagnosticSummary
          skillProfile={skillProfile}
          onRetake={handleStart}
          isRetaking={isStarting}
        />
      )}

      {/* Header */}
      <div className="text-center animate-slide-up">
        <Badge variant="analytics" className="mb-4">AI-тестирование</Badge>
        <h1 className="font-sans text-3xl sm:text-4xl font-bold tracking-tight text-mp-gray-900">
          {hasPriorResult ? 'Пройти диагностику ещё раз?' : 'Диагностика навыков'}
        </h1>
        <p className="text-body text-mp-gray-500 mt-3 max-w-2xl mx-auto">
          {hasPriorResult
            ? 'Уровень навыков растёт по мере обучения. Перепройдите тест, чтобы увидеть прогресс и обновить план обучения.'
            : 'Пройдите тест из 15 вопросов, чтобы определить свой уровень по 5 ключевым компетенциям селлера маркетплейсов. На основе результатов мы составим персональную программу обучения.'}
        </p>
      </div>

      {/* Skills grid — first-time intro only */}
      {!hasPriorResult && (
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 animate-slide-up" style={{ animationDelay: '100ms' }}>
        {SKILL_CATEGORIES.map((skill) => (
          <Card key={skill.name} className="text-center shadow-mp-card hover:shadow-mp-card-hover transition-all duration-300 hover:-translate-y-1">
            <CardContent className="pt-6 pb-5">
              <div className={`w-12 h-12 rounded-xl ${skill.bgColor} ${skill.textColor} flex items-center justify-center mx-auto mb-3`}>
                {skill.icon}
              </div>
              <h3 className="font-semibold text-mp-gray-900 text-body-sm">{skill.name}</h3>
              <p className="text-caption text-mp-gray-500 mt-1">{skill.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      )}

      {/* Info cards — first-time intro only */}
      {!hasPriorResult && (
      <div className="grid md:grid-cols-3 gap-4 animate-slide-up" style={{ animationDelay: '150ms' }}>
        <Card className="shadow-mp-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-heading flex items-center gap-2">
              <span className="text-display-sm text-mp-blue-500">15</span>
              <span className="text-mp-gray-500 font-normal text-body">вопросов</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-body-sm text-mp-gray-500">
              По 3 вопроса на каждую из 5 категорий навыков
            </p>
          </CardContent>
        </Card>

        <Card className="shadow-mp-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-heading flex items-center gap-2">
              <span className="text-display-sm text-mp-green-500">10-15</span>
              <span className="text-mp-gray-500 font-normal text-body">минут</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-body-sm text-mp-gray-500">
              Среднее время прохождения теста
            </p>
          </CardContent>
        </Card>

        <Card className="shadow-mp-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-heading flex items-center gap-2">
              <span className="text-display-sm text-mp-pink-500">Radar</span>
              <span className="text-mp-gray-500 font-normal text-body">chart</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-body-sm text-mp-gray-500">
              Визуальный отчёт о сильных и слабых сторонах
            </p>
          </CardContent>
        </Card>
      </div>
      )}

      {/* CTA — hidden for repeat users (Перепройти live в DiagnosticSummary) */}
      {!hasPriorResult && (
      <Card variant="gradient" className="shadow-mp-lg animate-slide-up" style={{ animationDelay: '200ms' }}>
        <CardContent className="py-12 text-center">
          <h2 className="font-sans text-2xl sm:text-3xl font-bold tracking-tight text-mp-gray-900 mb-2">
            Готовы узнать свой уровень?
          </h2>
          <p className="text-body text-mp-gray-500 mb-6">
            После теста вы получите персональный план обучения
          </p>
          <Button
            size="lg"
            onClick={handleStart}
            disabled={isStarting}
            className="shadow-mp-md"
          >
            {isStarting ? (
              <div className="flex items-center gap-2">
                <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <span>{loadingStage || 'Загрузка...'}</span>
              </div>
            ) : (
              'Начать диагностику'
            )}
          </Button>
          {isStarting && (
            <p className="mt-4 text-body-sm text-mp-gray-400 animate-fade-in">
              {loadingStage}
            </p>
          )}
        </CardContent>
      </Card>
      )}

      {/* Previous results hint — relevant only for first-time users with hidden history */}
      {!hasPriorResult && (
        <p className="text-center text-body-sm text-mp-gray-500">
          Ваши предыдущие результаты сохраняются в{' '}
          <a href="/profile/history" className="text-mp-blue-600 hover:text-mp-blue-700 underline">
            истории диагностик
          </a>
        </p>
      )}
      {hasPriorResult && (
        <p className="text-center text-body-sm text-mp-gray-500">
          Полная история диагностик —{' '}
          <a href="/profile/history" className="text-mp-blue-600 hover:text-mp-blue-700 underline">
            в профиле
          </a>
        </p>
      )}
    </div>
  );
}
