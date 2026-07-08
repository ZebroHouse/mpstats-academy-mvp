'use client';

import { Button } from '@/components/ui/button';

export function TochkaButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <Button type="button" variant="outline" className="w-full" onClick={onClick} disabled={disabled}>
      <span>Войти через</span>
      {/* Официальный бренд-бейдж «Точка Банк» (фирстиль Точки, фиолетовый #7F42E1). */}
      <img src="/tochka-badge.svg" alt="Точка Банк" className="ml-2 h-5 w-auto" />
    </Button>
  );
}
