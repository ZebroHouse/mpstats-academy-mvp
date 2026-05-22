'use client';

import { cn } from '@/lib/utils';

type Marketplace = 'WB' | 'OZON';

interface Props {
  value: Marketplace;
  onChange: (mp: Marketplace) => void;
}

const OPTIONS: { id: Marketplace; label: string; dot: string }[] = [
  { id: 'WB', label: 'Wildberries', dot: 'bg-purple-500' },
  { id: 'OZON', label: 'Ozon', dot: 'bg-sky-500' },
];

export function MarketplaceSwitch({ value, onChange }: Props) {
  return (
    <div className="inline-flex rounded-lg border border-mp-gray-200 overflow-hidden bg-white">
      {OPTIONS.map((o) => (
        <button
          key={o.id}
          onClick={() => onChange(o.id)}
          className={cn(
            'flex items-center gap-2 px-5 py-2.5 text-body-sm font-semibold transition-colors',
            value === o.id ? 'bg-mp-blue-500 text-white' : 'bg-white text-mp-gray-600 hover:bg-mp-gray-50',
          )}
        >
          <span className={cn('w-2 h-2 rounded-full', value === o.id ? 'bg-white' : o.dot)} />
          {o.label}
        </button>
      ))}
    </div>
  );
}
