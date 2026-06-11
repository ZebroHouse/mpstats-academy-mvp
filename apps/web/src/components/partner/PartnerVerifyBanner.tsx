'use client';
import { useState } from 'react';

export function PartnerVerifyBanner({ email }: { email: string }) {
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');

  async function resend() {
    setState('sending');
    try {
      const res = await fetch('/api/partner/verify/resend', { method: 'POST' });
      setState(res.ok ? 'sent' : 'error');
    } catch {
      setState('error');
    }
  }

  return (
    <div className="flex flex-wrap items-center justify-center gap-2 bg-amber-50 px-4 py-2 text-sm text-amber-900">
      <span>Подтвердите почту <span className="font-medium">{email}</span>, чтобы не потерять доступ.</span>
      {state === 'sent' ? (
        <span className="font-medium">Ссылка отправлена ✓</span>
      ) : (
        <button onClick={resend} disabled={state === 'sending'} className="font-medium underline disabled:opacity-50">
          {state === 'sending' ? 'Отправляем…' : 'Отправить ссылку'}
        </button>
      )}
      {state === 'error' && <span className="text-red-700">Не удалось отправить, попробуйте позже.</span>}
    </div>
  );
}
