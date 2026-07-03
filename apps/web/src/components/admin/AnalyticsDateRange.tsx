'use client';

import { cn } from '@/lib/utils';

export interface DateRangeValue {
  from: string; // yyyy-mm-dd
  to: string; // yyyy-mm-dd
}

/** Preset windows offered as chips, in inclusive calendar days. */
export const DEFAULT_RANGE_DAYS = [7, 14, 30, 90] as const;

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * A preset window ending today: `from` = today-(days-1), `to` = today.
 * Both `yyyy-mm-dd`, computed in UTC so it matches the wire bounds.
 */
export function presetRange(days: number): DateRangeValue {
  const to = todayUtc();
  const fromDate = new Date(`${to}T00:00:00.000Z`);
  fromDate.setUTCDate(fromDate.getUTCDate() - (days - 1));
  return { from: fromDate.toISOString().slice(0, 10), to };
}

/** Inclusive UTC Date bounds for a yyyy-mm-dd range (start-of-day → end-of-day). */
export function rangeToBounds(v: DateRangeValue): { from: Date; to: Date } {
  return {
    from: new Date(`${v.from}T00:00:00.000Z`),
    to: new Date(`${v.to}T23:59:59.999Z`),
  };
}

/** Inclusive day count of the range (used for the forward renewals window). */
export function daySpan(v: DateRangeValue): number {
  const from = new Date(`${v.from}T00:00:00.000Z`).getTime();
  const to = new Date(`${v.to}T00:00:00.000Z`).getTime();
  return Math.round((to - from) / 86_400_000) + 1;
}

interface AnalyticsDateRangeProps {
  value: DateRangeValue;
  onChange: (next: DateRangeValue) => void;
}

/**
 * Unified analytics period control: preset chips [7д][14д][30д][90д] followed by
 * a custom «С … По …» date range, all in one row. A chip highlights only when the
 * current value exactly equals its computed preset; editing a date de-highlights.
 */
export function AnalyticsDateRange({ value, onChange }: AnalyticsDateRangeProps) {
  const today = todayUtc();

  return (
    <div className="flex items-end gap-3 flex-wrap">
      <div className="flex items-center gap-1 bg-mp-gray-100 rounded-lg p-1">
        {DEFAULT_RANGE_DAYS.map((days) => {
          const preset = presetRange(days);
          const isActive = value.from === preset.from && value.to === preset.to;
          return (
            <button
              key={days}
              type="button"
              onClick={() => onChange(preset)}
              className={cn(
                'px-3 py-1.5 text-body-sm font-medium rounded-md transition-all duration-200',
                isActive
                  ? 'bg-white text-mp-blue-600 shadow-sm'
                  : 'text-mp-gray-600 hover:text-mp-gray-900',
              )}
            >
              {days}д
            </button>
          );
        })}
      </div>

      <div>
        <label className="text-xs text-mp-gray-500 block mb-1">С</label>
        <input
          type="date"
          value={value.from}
          max={value.to}
          onChange={(e) => onChange({ ...value, from: e.target.value })}
          className="px-3 py-1.5 border border-mp-gray-200 rounded-lg text-body-sm focus:outline-none focus:ring-2 focus:ring-mp-blue-500"
        />
      </div>
      <div>
        <label className="text-xs text-mp-gray-500 block mb-1">По</label>
        <input
          type="date"
          value={value.to}
          min={value.from}
          max={today}
          onChange={(e) => onChange({ ...value, to: e.target.value })}
          className="px-3 py-1.5 border border-mp-gray-200 rounded-lg text-body-sm focus:outline-none focus:ring-2 focus:ring-mp-blue-500"
        />
      </div>
    </div>
  );
}
