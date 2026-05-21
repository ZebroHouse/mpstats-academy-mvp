'use client';

import { cn } from '@/lib/utils';

interface WizardStepperProps {
  current: 1 | 2 | 3;
}

const STEPS = [
  { n: 1, label: '1. Цели' },
  { n: 2, label: '2. Маркетплейсы' },
  { n: 3, label: '3. Опыт' },
] as const;

/**
 * 3-segment progress bar for the onboarding wizard.
 * Segmented variant of diagnostic/ProgressBar — design tokens, not raw Tailwind.
 */
export function WizardStepper({ current }: WizardStepperProps) {
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        {STEPS.map((step) => (
          <div
            key={step.n}
            className={cn(
              'h-2 flex-1 rounded-full transition-colors duration-300',
              step.n <= current ? 'bg-mp-blue-500' : 'bg-mp-gray-200',
            )}
          />
        ))}
      </div>

      {/* Desktop: per-step labels */}
      <div className="hidden justify-between sm:flex">
        {STEPS.map((step) => (
          <span
            key={step.n}
            className={cn(
              'text-caption',
              step.n === current
                ? 'font-semibold text-mp-blue-700'
                : 'text-mp-gray-400',
            )}
          >
            {step.label}
          </span>
        ))}
      </div>

      {/* Mobile: compact counter */}
      <p className="text-caption text-mp-gray-400 sm:hidden">
        Шаг {current} из 3
      </p>
    </div>
  );
}
