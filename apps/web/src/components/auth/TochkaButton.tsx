'use client';

import { Button } from '@/components/ui/button';

export function TochkaButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <Button type="button" variant="outline" className="w-full" onClick={onClick} disabled={disabled}>
      {/* TODO(asset): swap for the official Tochka brand mark SVG when Kara provides one.
          Available go.mpstats assets are only a text-render SVG or an oversized wordmark — not a compact icon. */}
      Войти через Точку
    </Button>
  );
}
