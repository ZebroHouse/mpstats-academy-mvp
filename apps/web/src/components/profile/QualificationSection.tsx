'use client';

import { useState, useEffect } from 'react';
import { Check, CheckCircle2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { trpc } from '@/lib/trpc/client';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import {
  GOAL_OPTIONS,
  MARKETPLACE_OPTIONS,
  EXPERIENCE_OPTIONS,
} from '@/components/welcome/options';

/**
 * Секция «О вашем бизнесе» в /profile — редактирование квалификации,
 * собранной в онбординг-визарде /welcome. Значения подгружаются через
 * trpc.onboarding.getState, сохраняются через trpc.onboarding.complete.
 */
export function QualificationSection() {
  const utils = trpc.useUtils();
  const { data: state, isLoading } = trpc.onboarding.getState.useQuery();

  const [marketplaces, setMarketplaces] = useState<string[]>([]);
  const [experienceLevel, setExperienceLevel] = useState<string | null>(null);
  const [goals, setGoals] = useState<string[]>([]);
  const [goalText, setGoalText] = useState('');

  // Инициализируем локальный стейт из загруженных значений.
  useEffect(() => {
    if (state) {
      setMarketplaces(state.marketplaces ?? []);
      setExperienceLevel(state.experienceLevel ?? null);
      setGoals(state.goals ?? []);
      setGoalText(state.goalText ?? '');
    }
  }, [state]);

  const save = trpc.onboarding.complete.useMutation({
    onSuccess: () => {
      toast.success('Данные сохранены');
      utils.onboarding.getState.invalidate();
    },
    onError: () => {
      toast.error('Не удалось сохранить ответы. Попробуйте ещё раз.');
    },
  });

  const toggleGoal = (key: string) => {
    setGoals((prev) =>
      prev.includes(key) ? prev.filter((g) => g !== key) : [...prev, key],
    );
  };

  const toggleMarketplace = (key: string) => {
    setMarketplaces((prev) =>
      prev.includes(key) ? prev.filter((m) => m !== key) : [...prev, key],
    );
  };

  const handleSave = () => {
    save.mutate({
      marketplaces: marketplaces as never[],
      experienceLevel: experienceLevel as never,
      goals: goals as never[],
      goalText: goalText.trim() || null,
    });
  };

  return (
    <Card className="shadow-mp-card">
      <CardHeader>
        <CardTitle className="text-heading">О вашем бизнесе</CardTitle>
        <CardDescription className="text-body-sm">
          Эти ответы помогают платформе персонализировать рекомендации.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-8">
        {isLoading ? (
          <p className="text-body-sm text-mp-gray-500">Загрузка…</p>
        ) : (
          <>
            {/* Цели */}
            <div className="space-y-3">
              <p className="text-body font-semibold text-mp-gray-900">
                Зачем вы пришли в Академию?
              </p>
              <div className="flex flex-wrap gap-2">
                {GOAL_OPTIONS.map((goal) => {
                  const selected = goals.includes(goal.key);
                  const Icon = goal.icon;
                  return (
                    <button
                      key={goal.key}
                      type="button"
                      onClick={() => toggleGoal(goal.key)}
                      aria-pressed={selected}
                      className={cn(
                        'inline-flex min-h-11 items-center gap-2 rounded-full px-4 py-2 text-body-sm transition-colors',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mp-blue-500 focus-visible:ring-offset-2',
                        selected
                          ? 'border-2 border-mp-blue-500 bg-mp-blue-50 text-mp-blue-700'
                          : 'border border-mp-gray-200 bg-white text-mp-gray-700 hover:border-mp-blue-300 hover:bg-mp-gray-50',
                      )}
                    >
                      {selected ? (
                        <Check className="size-4 shrink-0" />
                      ) : (
                        <Icon className="size-4 shrink-0" />
                      )}
                      {goal.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Маркетплейсы */}
            <div className="space-y-3">
              <p className="text-body font-semibold text-mp-gray-900">
                На каких маркетплейсах вы работаете?
              </p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {MARKETPLACE_OPTIONS.map((mp) => {
                  const selected = marketplaces.includes(mp.key);
                  const Icon = mp.icon;
                  return (
                    <button
                      key={mp.key}
                      type="button"
                      onClick={() => toggleMarketplace(mp.key)}
                      aria-pressed={selected}
                      className={cn(
                        'relative flex min-h-20 flex-col items-center justify-center gap-2 rounded-xl p-4 text-body-sm transition-all',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mp-blue-500 focus-visible:ring-offset-2',
                        selected
                          ? 'border-2 border-mp-blue-500 bg-mp-blue-50 text-mp-blue-700'
                          : 'border border-mp-gray-200 bg-white text-mp-gray-700 hover:-translate-y-0.5 hover:shadow-mp-card-hover',
                      )}
                    >
                      {selected && (
                        <CheckCircle2 className="absolute right-2 top-2 size-4 text-mp-blue-600" />
                      )}
                      <Icon
                        className={cn(
                          'size-6',
                          selected ? 'text-mp-blue-600' : 'text-mp-gray-400',
                        )}
                      />
                      <span className="text-center font-medium">{mp.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Опыт */}
            <div className="space-y-3">
              <p className="text-body font-semibold text-mp-gray-900">
                Какой у вас опыт на маркетплейсах?
              </p>
              <div className="flex flex-col gap-3">
                {EXPERIENCE_OPTIONS.map((opt) => {
                  const selected = experienceLevel === opt.key;
                  return (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => setExperienceLevel(opt.key)}
                      aria-pressed={selected}
                      className={cn(
                        'flex min-h-11 w-full items-start gap-3 rounded-xl p-4 text-left transition-colors',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mp-blue-500 focus-visible:ring-offset-2',
                        selected
                          ? 'border-2 border-mp-blue-500 bg-mp-blue-50'
                          : 'border border-mp-gray-200 bg-white hover:border-mp-blue-300 hover:bg-mp-gray-50',
                      )}
                    >
                      <span
                        className={cn(
                          'mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border-2',
                          selected ? 'border-mp-blue-500' : 'border-mp-gray-300',
                        )}
                      >
                        {selected && (
                          <span className="size-2.5 rounded-full bg-mp-blue-500" />
                        )}
                      </span>
                      <span className="space-y-0.5">
                        <span className="block text-body font-semibold text-mp-gray-900">
                          {opt.title}
                        </span>
                        <span className="block text-body-sm text-mp-gray-500">
                          {opt.description}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Свободный текст */}
            <div className="space-y-2">
              <p className="text-body font-semibold text-mp-gray-900">
                Расскажите подробнее о ваших задачах
              </p>
              <Textarea
                value={goalText}
                onChange={(e) => setGoalText(e.target.value)}
                rows={3}
                maxLength={500}
                placeholder="Напишите, и мы поможем подобрать материалы…"
                className="resize-none"
              />
            </div>

            <Button onClick={handleSave} disabled={save.isPending}>
              {save.isPending ? 'Сохранение…' : 'Сохранить'}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
