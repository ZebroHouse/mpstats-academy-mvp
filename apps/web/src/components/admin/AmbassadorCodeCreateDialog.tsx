'use client';

import { useState } from 'react';
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

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated?: () => void;
}

export function AmbassadorCodeCreateDialog({ open, onOpenChange, onCreated }: Props) {
  // Rules of Hooks: all hooks above early returns.
  const [label, setLabel] = useState('');
  const [refereeTrialDays, setRefereeTrialDays] = useState<string>('14');
  const [maxUses, setMaxUses] = useState<string>('');
  const [expiresAt, setExpiresAt] = useState<string>('');
  const [code, setCode] = useState<string>('');

  const utils = trpc.useUtils();
  const createMutation = trpc.referral.admin.createAmbassadorCode.useMutation({
    onSuccess: () => {
      toast.success('Код создан');
      utils.referral.admin.listAmbassadorCodes.invalidate();
      // Reset form
      setLabel('');
      setRefereeTrialDays('14');
      setMaxUses('');
      setExpiresAt('');
      setCode('');
      onOpenChange(false);
      onCreated?.();
    },
    onError: (e) => {
      if (e.data?.code === 'CONFLICT') {
        toast.error('Код уже занят. Попробуйте другой или оставьте поле пустым для авто-генерации.');
      } else {
        toast.error(`Ошибка: ${e.message}`);
      }
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const trimmedLabel = label.trim();
    if (!trimmedLabel) {
      toast.error('Укажите метку');
      return;
    }

    const days = parseInt(refereeTrialDays, 10);
    if (!Number.isFinite(days) || days < 1 || days > 365) {
      toast.error('Trial: число от 1 до 365');
      return;
    }

    const parsedMaxUses = maxUses.trim() ? parseInt(maxUses, 10) : null;
    if (parsedMaxUses !== null && (!Number.isFinite(parsedMaxUses) || parsedMaxUses < 1)) {
      toast.error('Лимит использований: число ≥ 1 или пусто');
      return;
    }

    const parsedExpiresAt = expiresAt ? new Date(expiresAt) : null;
    if (parsedExpiresAt && parsedExpiresAt <= new Date()) {
      toast.error('Дата истечения должна быть в будущем');
      return;
    }

    const trimmedCode = code.trim().toUpperCase();

    createMutation.mutate({
      label: trimmedLabel,
      refereeTrialDays: days,
      maxUses: parsedMaxUses,
      expiresAt: parsedExpiresAt,
      ...(trimmedCode ? { code: trimmedCode } : {}),
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Создать амбассадорский код</DialogTitle>
          <DialogDescription>
            Код для внешнего блогера. Trial-длительность для приведённого юзера immutable после
            создания.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-body-sm font-medium text-mp-gray-700 block mb-1">
              Метка (имя блогера) *
            </label>
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Блогер Анна"
              maxLength={80}
              required
            />
          </div>
          <div>
            <label className="text-body-sm font-medium text-mp-gray-700 block mb-1">
              Длительность trial, дн *
            </label>
            <Input
              type="number"
              value={refereeTrialDays}
              onChange={(e) => setRefereeTrialDays(e.target.value)}
              min={1}
              max={365}
              required
            />
            <p className="text-xs text-mp-gray-500 mt-1">1..365. Нельзя изменить позже.</p>
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
              Истекает (опц.)
            </label>
            <Input
              type="datetime-local"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
            />
          </div>
          <div>
            <label className="text-body-sm font-medium text-mp-gray-700 block mb-1">
              Код (опц.)
            </label>
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="AMB-XXXXXX (auto)"
              className="font-mono"
            />
            <p className="text-xs text-mp-gray-500 mt-1">
              Оставьте пустым для авто-генерации.
            </p>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={createMutation.isPending}
            >
              Отмена
            </Button>
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? 'Создание…' : 'Создать'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
