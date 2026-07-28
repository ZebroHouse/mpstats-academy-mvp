'use client';

import { cn } from '@/lib/utils';

interface PartnerTrafficToggleProps {
  /** true = учитывать партнёрский трафик (includePartner). */
  value: boolean;
  onChange: (next: boolean) => void;
}

/**
 * Чип-переключатель «Партнёрский трафик: не учитывать / учитывать» для строки
 * фильтров админ-аналитики. По умолчанию выключен (не учитывать) — метрики
 * показывают органику, а не бесплатный курс инструментов MPSTATS.
 */
export function PartnerTrafficToggle({ value, onChange }: PartnerTrafficToggleProps) {
  return (
    <div>
      <label className="text-xs text-mp-gray-500 block mb-1">Партнёрский трафик</label>
      <div className="flex items-center gap-1 bg-mp-gray-100 rounded-lg p-1">
        {([[false, 'Не учитывать'], [true, 'Учитывать']] as const).map(([val, label]) => (
          <button
            key={String(val)}
            type="button"
            onClick={() => onChange(val)}
            className={cn(
              'px-3 py-1 text-body-sm font-medium rounded-md transition-all duration-200',
              value === val ? 'bg-white text-mp-blue-600 shadow-sm' : 'text-mp-gray-600 hover:text-mp-gray-900',
            )}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
