'use client';

import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { Search, Copy, Pencil, Plus } from 'lucide-react';
import { AmbassadorCodeCreateDialog } from './AmbassadorCodeCreateDialog';
import {
  AmbassadorCodeEditDialog,
  type AmbassadorCodeRow,
} from './AmbassadorCodeEditDialog';

function formatDateTime(d: Date | string | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDate(d: Date | string | null): string {
  if (!d) return '∞';
  return new Date(d).toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

export function AmbassadorCodesTable() {
  // Rules of Hooks: all hooks above early returns (per
  // .claude/memory/feedback_rules_of_hooks_early_returns.md — Phase 57 incident).
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [editingCode, setEditingCode] = useState<AmbassadorCodeRow | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);

  const utils = trpc.useUtils();
  const list = trpc.referral.admin.listAmbassadorCodes.useQuery({
    take: 50,
    cursor: cursor ?? undefined,
    search: search || undefined,
  });
  const toggleMutation = trpc.referral.admin.toggleAmbassadorCode.useMutation({
    onSuccess: () => {
      utils.referral.admin.listAmbassadorCodes.invalidate();
    },
    onError: (e) => toast.error(`Ошибка: ${e.message}`),
  });

  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput);
      setCursor(null);
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  function handleCopyLink(code: string) {
    const url = `https://platform.mpstats.academy/register?ref=${code}`;
    navigator.clipboard
      .writeText(url)
      .then(() => toast.success('Ссылка скопирована'))
      .catch(() => toast.error('Не удалось скопировать'));
  }

  function handleToggle(id: string, current: boolean) {
    toggleMutation.mutate({ id, isActive: !current });
  }

  const items = list.data?.items ?? [];
  const nextCursor = list.data?.nextCursor ?? null;

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-mp-gray-400" />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Поиск по коду или метке"
            className="w-full pl-9 pr-3 py-2 border border-mp-gray-200 rounded-lg text-body-sm focus:outline-none focus:ring-2 focus:ring-mp-blue-500"
          />
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="w-4 h-4 mr-1" />
          Создать код
        </Button>
      </div>

      {/* Table */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-body-sm">
            <thead className="bg-mp-gray-50 border-b border-mp-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-mp-gray-700">Код</th>
                <th className="text-left px-4 py-3 font-medium text-mp-gray-700">Метка</th>
                <th className="text-left px-4 py-3 font-medium text-mp-gray-700">Trial, дн</th>
                <th className="text-left px-4 py-3 font-medium text-mp-gray-700">Использований</th>
                <th className="text-left px-4 py-3 font-medium text-mp-gray-700">Истекает</th>
                <th className="text-left px-4 py-3 font-medium text-mp-gray-700">Активен</th>
                <th className="text-left px-4 py-3 font-medium text-mp-gray-700">Активации</th>
                <th className="text-left px-4 py-3 font-medium text-mp-gray-700">Платные</th>
                <th className="text-left px-4 py-3 font-medium text-mp-gray-700">Создан</th>
                <th className="text-right px-4 py-3 font-medium text-mp-gray-700">Действия</th>
              </tr>
            </thead>
            <tbody>
              {list.isLoading && (
                <tr>
                  <td colSpan={10} className="p-6">
                    <Skeleton className="h-32 w-full" />
                  </td>
                </tr>
              )}
              {!list.isLoading && items.length === 0 && (
                <tr>
                  <td colSpan={10} className="p-8 text-center text-mp-gray-500">
                    <div className="space-y-2">
                      <div>Нет кодов. Создайте первый.</div>
                      <Button onClick={() => setCreateOpen(true)} size="sm">
                        <Plus className="w-4 h-4 mr-1" />
                        Создать код
                      </Button>
                    </div>
                  </td>
                </tr>
              )}
              {items.map((row) => (
                <tr key={row.id} className="border-b border-mp-gray-100 hover:bg-mp-gray-50/50">
                  <td className="px-4 py-3 font-mono text-mp-gray-900">{row.code}</td>
                  <td className="px-4 py-3 text-mp-gray-900">{row.label}</td>
                  <td className="px-4 py-3 text-mp-gray-700">{row.refereeTrialDays}</td>
                  <td className="px-4 py-3 text-mp-gray-700">
                    {row.currentUses}/{row.maxUses ?? '∞'}
                  </td>
                  <td className="px-4 py-3 text-mp-gray-700 whitespace-nowrap">
                    {formatDate(row.expiresAt)}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => handleToggle(row.id, row.isActive)}
                      disabled={toggleMutation.isPending}
                      className={cn(
                        'px-2 py-0.5 rounded-full text-xs font-medium transition-colors',
                        row.isActive
                          ? 'bg-green-50 text-green-700 hover:bg-green-100'
                          : 'bg-mp-gray-100 text-mp-gray-600 hover:bg-mp-gray-200',
                      )}
                    >
                      {row.isActive ? 'Активен' : 'Выключен'}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-mp-gray-700">{row.activations}</td>
                  <td className="px-4 py-3 text-mp-gray-700">{row.paid_conversions}</td>
                  <td className="px-4 py-3 text-mp-gray-600 whitespace-nowrap">
                    {formatDateTime(row.createdAt)}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleCopyLink(row.code)}
                        title="Скопировать ссылку"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setEditingCode(row as AmbassadorCodeRow)}
                        title="Редактировать"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Pagination */}
      {nextCursor && (
        <div className="flex justify-center">
          <Button variant="outline" onClick={() => setCursor(nextCursor)}>
            Загрузить ещё
          </Button>
        </div>
      )}

      {/* Create dialog */}
      <AmbassadorCodeCreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
      />

      {/* Edit dialog */}
      <AmbassadorCodeEditDialog
        code={editingCode}
        onClose={() => setEditingCode(null)}
      />
    </div>
  );
}
