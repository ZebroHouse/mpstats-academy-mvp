'use client';

import { CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MARKETPLACE_OPTIONS } from './options';

interface StepMarketplacesProps {
  marketplaces: string[];
  onChange: (marketplaces: string[]) => void;
}

/**
 * Wizard step 2 — 7 multi-select marketplace cards.
 */
export function StepMarketplaces({ marketplaces, onChange }: StepMarketplacesProps) {
  const toggle = (key: string) => {
    onChange(
      marketplaces.includes(key)
        ? marketplaces.filter((m) => m !== key)
        : [...marketplaces, key],
    );
  };

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h2 className="text-heading-lg font-semibold text-mp-gray-900 sm:text-heading-xl">
          На каких маркетплейсах вы работаете?
        </h2>
        <p className="text-body text-mp-gray-500">Можно выбрать несколько.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {MARKETPLACE_OPTIONS.map((mp) => {
          const selected = marketplaces.includes(mp.key);
          const Icon = mp.icon;
          return (
            <button
              key={mp.key}
              type="button"
              onClick={() => toggle(mp.key)}
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
  );
}
