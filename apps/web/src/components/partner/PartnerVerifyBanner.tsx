'use client';
import { useEffect, useState } from 'react';

const STORAGE_KEY = 'partner_verify_sent_at';
const THROTTLE_MS = 60_000;

export function PartnerVerifyBanner({ email }: { email: string }) {
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [cooldown, setCooldown] = useState(false);

  useEffect(() => {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (raw && Date.now() - Number(raw) < THROTTLE_MS) {
      setCooldown(true);
      const remaining = THROTTLE_MS - (Date.now() - Number(raw));
      const timer = setTimeout(() => setCooldown(false), remaining);
      return () => clearTimeout(timer);
    }
  }, []);

  async function resend() {
    setState('sending');
    try {
      const res = await fetch('/api/partner/verify/resend', { method: 'POST' });
      if (res.ok) {
        sessionStorage.setItem(STORAGE_KEY, String(Date.now()));
        setState('sent');
        setCooldown(true);
        setTimeout(() => setCooldown(false), THROTTLE_MS);
      } else {
        setState('error');
      }
    } catch {
      setState('error');
    }
  }

  const isDisabled = state === 'sending' || cooldown;

  return (
    <div className="flex flex-wrap items-center justify-center gap-2 bg-amber-50 px-4 py-2 text-sm text-amber-900">
      <span>Подтвердите почту <span className="font-medium">{email}</span>, чтобы не потерять доступ.</span>
      {state === 'sent' ? (
        <span className="font-medium">Ссылка отправлена ✓</span>
      ) : (
        <>
          <button onClick={resend} disabled={isDisabled} className="font-medium underline disabled:opacity-50">
            {state === 'sending' ? 'Отправляем…' : 'Отправить ссылку'}
          </button>
          {cooldown && state !== 'sending' && (
            <span className="text-amber-700">Ссылка уже отправлена</span>
          )}
        </>
      )}
      {state === 'error' && <span className="text-red-700">Не удалось отправить, попробуйте позже.</span>}
    </div>
  );
}
