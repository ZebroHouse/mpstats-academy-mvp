'use client';

import { cn } from '@/lib/utils';
import { EXPERIENCE_OPTIONS } from './options';

interface StepExperienceProps {
  experienceLevel: string | null;
  onChange: (level: string) => void;
}

/**
 * Wizard step 3 — 4 single-select experience cards (radio-style).
 */
export function StepExperience({ experienceLevel, onChange }: StepExperienceProps) {
  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h2 className="text-heading-lg font-semibold text-mp-gray-900 sm:text-heading-xl">
          Какой у вас опыт на маркетплейсах?
        </h2>
      </div>

      <div className="flex flex-col gap-3">
        {EXPERIENCE_OPTIONS.map((opt) => {
          const selected = experienceLevel === opt.key;
          return (
            <button
              key={opt.key}
              type="button"
              onClick={() => onChange(opt.key)}
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
                {selected && <span className="size-2.5 rounded-full bg-mp-blue-500" />}
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
  );
}
