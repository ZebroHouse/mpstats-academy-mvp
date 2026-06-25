'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

type Axis = 'ANALYTICS' | 'MARKETING' | 'CONTENT' | 'OPERATIONS' | 'FINANCE';
type Marketplace = 'WB' | 'OZON' | 'BOTH';

const AXIS_OPTIONS: { value: Axis; label: string }[] = [
  { value: 'ANALYTICS', label: 'Аналитика' },
  { value: 'MARKETING', label: 'Маркетинг' },
  { value: 'CONTENT', label: 'Контент' },
  { value: 'OPERATIONS', label: 'Операции' },
  { value: 'FINANCE', label: 'Финансы' },
];

const MARKETPLACE_OPTIONS: { value: Marketplace; label: string }[] = [
  { value: 'WB', label: 'Wildberries' },
  { value: 'OZON', label: 'Ozon' },
  { value: 'BOTH', label: 'Обе площадки' },
];

export function CreateJobDialog({ onClose }: { onClose: () => void }) {
  const utils = trpc.useUtils();
  const [slug, setSlug] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [marketplace, setMarketplace] = useState<Marketplace>('WB');
  const [axes, setAxes] = useState<Axis[]>([]);
  const [slugError, setSlugError] = useState<string | null>(null);

  const create = trpc.admin.job.createJob.useMutation({
    onSuccess: (r) => {
      utils.admin.job.getJobs.invalidate();
      if (r.embedded) {
        toast.success('Задача создана');
      } else {
        toast.warning('Задача создана, но эмбеддинг не создан — нажмите «Переиндексировать»');
      }
      onClose();
    },
    onError: (e) => {
      if (e.data?.code === 'CONFLICT') {
        setSlugError('Задача с таким slug уже существует');
      } else {
        toast.error('Ошибка создания: ' + e.message);
      }
    },
  });

  // Axes order preserved as the user clicks — first selected = primary category.
  const toggleAxis = (axis: Axis) => {
    setAxes((prev) =>
      prev.includes(axis) ? prev.filter((a) => a !== axis) : [...prev, axis],
    );
  };

  const canSubmit =
    slug.trim().length > 0 &&
    title.trim().length > 0 &&
    description.trim().length > 0 &&
    axes.length > 0 &&
    !create.isPending;

  const handleSubmit = () => {
    setSlugError(null);
    create.mutate({
      slug: slug.trim(),
      title: title.trim(),
      description: description.trim(),
      marketplace,
      axes,
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl p-6 w-full max-w-lg space-y-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-heading font-semibold">Создать задачу</h3>

        {/* Slug */}
        <div className="space-y-1">
          <label className="text-body-sm font-medium text-mp-gray-700">Slug</label>
          <Input
            placeholder="naprimer-nastroit-reklamu"
            value={slug}
            error={!!slugError}
            onChange={(e) => {
              setSlug(e.target.value);
              if (slugError) setSlugError(null);
            }}
          />
          {slugError ? (
            <p className="text-caption text-red-600">{slugError}</p>
          ) : (
            <p className="text-caption text-mp-gray-400">
              Только строчные латинские буквы, цифры и дефис (a-z 0-9 -)
            </p>
          )}
        </div>

        {/* Title */}
        <div className="space-y-1">
          <label className="text-body-sm font-medium text-mp-gray-700">Название</label>
          <Input
            placeholder="Название задачи"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>

        {/* Description */}
        <div className="space-y-1">
          <label className="text-body-sm font-medium text-mp-gray-700">Описание</label>
          <Textarea
            placeholder="Краткое описание задачи (используется для AI-поиска)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
          />
        </div>

        {/* Marketplace */}
        <div className="space-y-1">
          <label className="text-body-sm font-medium text-mp-gray-700">Площадка</label>
          <select
            value={marketplace}
            onChange={(e) => setMarketplace(e.target.value as Marketplace)}
            className="flex h-11 w-full rounded-xl border border-mp-gray-200 bg-white px-4 text-body text-mp-gray-900 focus-visible:outline-none focus:border-mp-blue-500 focus:ring-2 focus:ring-mp-blue-500/20"
          >
            {MARKETPLACE_OPTIONS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </div>

        {/* Axes */}
        <div className="space-y-1">
          <label className="text-body-sm font-medium text-mp-gray-700">Оси (≥1)</label>
          <div className="flex flex-wrap gap-2">
            {AXIS_OPTIONS.map((a) => {
              const selected = axes.includes(a.value);
              return (
                <button
                  key={a.value}
                  type="button"
                  onClick={() => toggleAxis(a.value)}
                  className={`rounded-full px-3 py-1 text-body-sm font-medium border transition-colors ${
                    selected
                      ? 'bg-mp-blue-50 border-mp-blue-400 text-mp-blue-700'
                      : 'bg-white border-mp-gray-200 text-mp-gray-600 hover:border-mp-gray-300'
                  }`}
                >
                  {a.label}
                </button>
              );
            })}
          </div>
          <p className="text-caption text-mp-gray-400">
            Первая выбранная ось = основная категория в каталоге
          </p>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose} disabled={create.isPending}>
            Отмена
          </Button>
          <Button disabled={!canSubmit} onClick={handleSubmit}>
            {create.isPending ? 'Создание…' : 'Создать'}
          </Button>
        </div>
      </div>
    </div>
  );
}
