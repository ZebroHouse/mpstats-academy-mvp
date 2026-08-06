'use client';

import { Check } from 'lucide-react';
import Link from 'next/link';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import { GOAL_OPTIONS } from './options';

interface StepIntentProps {
  userName: string | null;
  goals: string[];
  goalText: string;
  onGoalsChange: (goals: string[]) => void;
  onGoalTextChange: (text: string) => void;
  acceptLegal: boolean;
  onAcceptLegalChange: (accepted: boolean) => void;
  /** Show the legal-acceptance checkbox. Hidden for email registrants who
   *  already accepted offer + PDN at /register (see welcome page gate). */
  showLegal: boolean;
}

/**
 * Wizard step 1 — intent capture: 7 multi-select goal chips + optional free text,
 * plus a legal-acceptance checkbox (offer + PDN processing consent) shown only to
 * users who didn't consent at registration (OAuth/partner). When shown, advancing
 * past step 1 is gated on `acceptLegal` in the parent wizard.
 */
export function StepIntent({
  userName,
  goals,
  goalText,
  onGoalsChange,
  onGoalTextChange,
  acceptLegal,
  onAcceptLegalChange,
  showLegal,
}: StepIntentProps) {
  const toggleGoal = (key: string) => {
    onGoalsChange(
      goals.includes(key) ? goals.filter((g) => g !== key) : [...goals, key],
    );
  };

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-heading-lg font-semibold text-mp-gray-900 sm:text-heading-xl">
          {userName ? `Привет, ${userName}! 👋` : 'Добро пожаловать в MPSTATS Academy!'}
        </h1>
        <p className="text-body text-mp-gray-500">
          Пара вопросов — и платформа подстроится под ваши задачи.
        </p>
      </div>

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

      <div className="space-y-2">
        <Textarea
          value={goalText}
          onChange={(e) => onGoalTextChange(e.target.value)}
          rows={3}
          maxLength={500}
          placeholder="Напишите, и мы поможем подобрать материалы…"
          className="resize-none"
        />
        <p className="text-caption text-mp-gray-400">
          Это нужно только для персонализации. Ответы можно изменить в профиле.
        </p>
      </div>

      {showLegal && (
        <label className="flex items-start gap-2 cursor-pointer">
          <Checkbox
            checked={acceptLegal}
            onCheckedChange={(v) => onAcceptLegalChange(v === true)}
            className="mt-0.5"
          />
          <span className="text-body-sm text-mp-gray-600 leading-tight">
            Я принимаю условия{' '}
            <Link
              href="/legal/offer"
              target="_blank"
              rel="noopener"
              className="text-mp-blue-600 hover:underline"
            >
              оферты
            </Link>{' '}
            и{' '}
            <Link
              href="/legal/pdn"
              target="_blank"
              rel="noopener"
              className="text-mp-blue-600 hover:underline"
            >
              согласие на обработку персональных данных
            </Link>
          </span>
        </label>
      )}
    </div>
  );
}
