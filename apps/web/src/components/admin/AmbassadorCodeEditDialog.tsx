'use client';

import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export interface AmbassadorCodeRow {
  id: string;
  code: string;
  label: string;
  refereeTrialDays: number;
  maxUses: number | null;
  currentUses: number;
  expiresAt: Date | string | null;
  isActive: boolean;
  landingTarget: 'HOME' | 'REGISTER';
  createdAt: Date | string;
  activations: number;
  paid_conversions: number;
}

interface Props {
  code: AmbassadorCodeRow | null;
  onClose: () => void;
}

function toLocalDateTimeInput(d: Date | string | null): string {
  if (!d) return '';
  const date = new Date(d);
  // Format as YYYY-MM-DDTHH:MM (local) for <input type="datetime-local">
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function AmbassadorCodeEditDialog({ code, onClose }: Props) {
  // Rules of Hooks: all hooks above early returns.
  const [label, setLabel] = useState('');
  const [maxUses, setMaxUses] = useState<string>('');
  const [expiresAt, setExpiresAt] = useState<string>('');
  const [isActive, setIsActive] = useState(true);
  const [landingTarget, setLandingTarget] = useState<'HOME' | 'REGISTER'>('REGISTER');

  const utils = trpc.useUtils();
  const updateMutation = trpc.referral.admin.updateAmbassadorCode.useMutation({
    onSuccess: () => {
      toast.success('Сохранено');
      utils.referral.admin.listAmbassadorCodes.invalidate();
      onClose();
    },
    onError: (e) => toast.error(`Ошибка: ${e.message}`),
  });

  useEffect(() => {
    if (code) {
      setLabel(code.label);
      setMaxUses(code.maxUses === null ? '' : String(code.maxUses));
      setExpiresAt(toLocalDateTimeInput(code.expiresAt));
      setIsActive(code.isActive);
      setLandingTarget(code.landingTarget);
    }
  }, [code]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!code) return;

    const trimmedLabel = label.trim();
    if (!trimmedLabel) {
      toast.error('Укажите метку');
      return;
    }

    const parsedMaxUses = maxUses.trim() ? parseInt(maxUses, 10) : null;
    if (parsedMaxUses !== null && (!Number.isFinite(parsedMaxUses) || parsedMaxUses < 1)) {
      toast.error('Лимит использований: число ≥ 1 или пусто');
      return;
    }

    const parsedExpiresAt = expiresAt ? new Date(expiresAt) : null;

    // D-01: refereeTrialDays / code / codeType NEVER included in payload.
    updateMutation.mutate({
      id: code.id,
      label: trimmedLabel,
      maxUses: parsedMaxUses,
      expiresAt: parsedExpiresAt,
      isActive,
      landingTarget,
    });
  }

  const open = code !== null;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Редактировать код</DialogTitle>
          <DialogDescription>
            Trial-длительность и сам код менять нельзя — это могло бы сломать консистентность с
            уже выданными подписками.
          </DialogDescription>
        </DialogHeader>
        {code && (
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Read-only */}
            <div className="grid grid-cols-2 gap-3 p-3 bg-mp-gray-50 rounded-lg">
              <div>
                <div className="text-xs text-mp-gray-500">Код</div>
                <div className="font-mono text-body-sm text-mp-gray-700">{code.code}</div>
              </div>
              <div>
                <div className="text-xs text-mp-gray-500">Trial (immutable)</div>
                <div className="text-body-sm text-mp-gray-700">{code.refereeTrialDays} дн</div>
              </div>
              <div>
                <div className="text-xs text-mp-gray-500">Использований</div>
                <div className="text-body-sm text-mp-gray-700">{code.currentUses}</div>
              </div>
              <div>
                <div className="text-xs text-mp-gray-500">Создан</div>
                <div className="text-body-sm text-mp-gray-700">
                  {new Date(code.createdAt).toLocaleDateString('ru-RU')}
                </div>
              </div>
            </div>

            <div>
              <label className="text-body-sm font-medium text-mp-gray-700 block mb-1">
                Метка
              </label>
              <Input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                maxLength={80}
              />
            </div>
            <div>
              <label className="text-body-sm font-medium text-mp-gray-700 block mb-1">
                Лимит использований
              </label>
              <Input
                type="number"
                value={maxUses}
                onChange={(e) => setMaxUses(e.target.value)}
                min={1}
                placeholder="Пусто = безлимит"
              />
            </div>
            <div>
              <label className="text-body-sm font-medium text-mp-gray-700 block mb-1">
                Истекает
              </label>
              <Input
                type="datetime-local"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
              />
              <p className="text-xs text-mp-gray-500 mt-1">Пусто = бессрочный.</p>
            </div>
            <div>
              <label className="text-body-sm font-medium text-mp-gray-700 block mb-1">
                Куда ведёт ссылка
              </label>
              <select
                value={landingTarget}
                onChange={(e) => setLandingTarget(e.target.value as 'HOME' | 'REGISTER')}
                className="w-full px-3 py-2 border border-mp-gray-200 rounded-lg text-body-sm bg-white focus:outline-none focus:ring-2 focus:ring-mp-blue-500"
              >
                <option value="REGISTER">Страница регистрации (/register)</option>
                <option value="HOME">Главная страница (/)</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <input
                id="edit-isActive"
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="w-4 h-4"
              />
              <label htmlFor="edit-isActive" className="text-body-sm text-mp-gray-700">
                Активен
              </label>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                disabled={updateMutation.isPending}
              >
                Отмена
              </Button>
              <Button type="submit" disabled={updateMutation.isPending}>
                {updateMutation.isPending ? 'Сохранение…' : 'Сохранить'}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
