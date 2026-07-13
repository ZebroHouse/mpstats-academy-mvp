'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Copy, Check } from 'lucide-react';

export function ReferralCodeBlock({ code }: { code: string | null }) {
  const [copied, setCopied] = useState(false);

  if (!code) {
    return (
      <div className="border border-mp-gray-200 rounded-lg p-4 bg-mp-gray-50 text-sm text-mp-gray-600">
        Генерируем твою реферальную ссылку — обнови страницу через минуту.
      </div>
    );
  }

  const link =
    typeof window !== 'undefined'
      ? `${window.location.origin}/register?ref=${code}`
      : `https://platform.mpstats.academy/register?ref=${code}`;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="border border-mp-gray-200 rounded-lg p-4 bg-white">
      <div className="text-sm text-mp-gray-500 mb-1">Твоя ссылка</div>
      <div className="flex items-center gap-2">
        <input
          readOnly
          value={link}
          className="flex-1 font-mono text-sm bg-mp-gray-50 rounded px-3 py-2 border border-mp-gray-200"
        />
        <Button onClick={handleCopy} variant="outline" size="sm">
          {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
          {copied ? 'Скопировано' : 'Скопировать'}
        </Button>
      </div>
      <div className="text-xs text-mp-gray-500 mt-2">
        Код: <span className="font-mono">{code}</span>
      </div>
    </div>
  );
}
