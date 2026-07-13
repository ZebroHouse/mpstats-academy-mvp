'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { trpc } from '@/lib/trpc/client';
import { toast } from 'sonner';
import { Plus, ChevronDown, ChevronUp, Copy, XCircle } from 'lucide-react';

type PromoStatus = 'active' | 'used' | 'expired' | 'disabled';

function getPromoStatus(promo: {
  isActive: boolean;
  currentUses: number;
  maxUses: number;
  expiresAt: string | Date | null;
}): PromoStatus {
  if (!promo.isActive) return 'disabled';
  if (promo.expiresAt && new Date(promo.expiresAt) < new Date()) return 'expired';
  if (promo.currentUses >= promo.maxUses) return 'used';
  return 'active';
}

const STATUS_CONFIG: Record<PromoStatus, { label: string; variant: string }> = {
  active: { label: 'Активен', variant: 'success' },
  used: { label: 'Использован', variant: 'default' },
  expired: { label: 'Истёк', variant: 'destructive' },
  disabled: { label: 'Отключён', variant: 'default' },
};

const DURATION_PRESETS = [7, 14, 30];

export default function AdminPromoPage() {
  const [showForm, setShowForm] = useState(false);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  // Form state
  const [formMode, setFormMode] = useState<'duration' | 'discount'>('duration');
  const [formPlanType, setFormPlanType] = useState<'PLATFORM' | 'COURSE'>('PLATFORM');
  const [formCourseId, setFormCourseId] = useState('');
  const [formDuration, setFormDuration] = useState(30);
  const [formCustomDuration, setFormCustomDuration] = useState('');
  const [formDiscountType, setFormDiscountType] = useState<'PERCENT' | 'FIXED'>('PERCENT');
  const [formDiscountValue, setFormDiscountValue] = useState('');
  const [formMaxUses, setFormMaxUses] = useState(1);
  const [formExpiresAt, setFormExpiresAt] = useState('');
  const [formNoExpiry, setFormNoExpiry] = useState(true);
  const [formCode, setFormCode] = useState('');

  const utils = trpc.useUtils();

  // Queries
  const promoCodes = trpc.promo.getPromoCodes.useQuery();
  const courses = trpc.billing.getCourses.useQuery();

  // Mutations
  const createPromo = trpc.promo.createPromoCode.useMutation({
    onSuccess: (data) => {
      toast.success(`Промо-код ${data.code} создан`);
      utils.promo.getPromoCodes.invalidate();
      resetForm();
      setShowForm(false);
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  const deactivatePromo = trpc.promo.deactivatePromoCode.useMutation({
    onSuccess: () => {
      toast.success('Промо-код деактивирован');
      utils.promo.getPromoCodes.invalidate();
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  function resetForm() {
    setFormMode('duration');
    setFormPlanType('PLATFORM');
    setFormCourseId('');
    setFormDuration(30);
    setFormCustomDuration('');
    setFormDiscountType('PERCENT');
    setFormDiscountValue('');
    setFormMaxUses(1);
    setFormExpiresAt('');
    setFormNoExpiry(true);
    setFormCode('');
  }

  function handleCreate() {
    const base = {
      code: formCode || undefined,
      planType: formPlanType,
      courseId: formPlanType === 'COURSE' ? formCourseId || undefined : undefined,
      maxUses: formMaxUses,
      expiresAt: formNoExpiry ? undefined : formExpiresAt || undefined,
    };

    if (formMode === 'discount') {
      const value = parseInt(formDiscountValue, 10);
      if (!value || value < 1) {
        toast.error('Укажите размер скидки');
        return;
      }
      if (formDiscountType === 'PERCENT' && value > 100) {
        toast.error('Процент скидки не может превышать 100');
        return;
      }
      createPromo.mutate({
        ...base,
        discountType: formDiscountType,
        discountValue: value,
      });
      return;
    }

    const duration = formCustomDuration ? parseInt(formCustomDuration, 10) : formDuration;
    if (!duration || duration < 1) {
      toast.error('Укажите длительность');
      return;
    }

    createPromo.mutate({
      ...base,
      durationDays: duration,
    });
  }

  function formatDate(date: string | Date | null) {
    if (!date) return '\u2014';
    return new Date(date).toLocaleDateString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  }

  function copyCode(code: string) {
    navigator.clipboard.writeText(code);
    toast.success('Код скопирован');
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-heading-lg font-bold text-mp-gray-900">
            Промо-коды
          </h2>
          <p className="text-body-sm text-mp-gray-500 mt-1">
            Создание и управление промо-кодами для бесплатного доступа
          </p>
        </div>
        <Button onClick={() => setShowForm(!showForm)}>
          <Plus className="w-4 h-4 mr-2" />
          Создать промо-код
        </Button>
      </div>

      {/* Create Form */}
      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle className="text-heading-md">Новый промо-код</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Plan Type */}
            <div>
              <label className="block text-body-sm font-medium text-mp-gray-700 mb-1.5">
                Тип доступа
              </label>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => { setFormPlanType('PLATFORM'); setFormCourseId(''); }}
                  className={`px-4 py-2 rounded-lg text-body-sm font-medium border transition-colors ${
                    formPlanType === 'PLATFORM'
                      ? 'bg-mp-blue-50 border-mp-blue-300 text-mp-blue-700'
                      : 'border-mp-gray-200 text-mp-gray-600 hover:bg-mp-gray-50'
                  }`}
                >
                  Платформа
                </button>
                <button
                  type="button"
                  onClick={() => setFormPlanType('COURSE')}
                  className={`px-4 py-2 rounded-lg text-body-sm font-medium border transition-colors ${
                    formPlanType === 'COURSE'
                      ? 'bg-mp-blue-50 border-mp-blue-300 text-mp-blue-700'
                      : 'border-mp-gray-200 text-mp-gray-600 hover:bg-mp-gray-50'
                  }`}
                >
                  Курс
                </button>
              </div>
            </div>

            {/* Course select (only for COURSE type) */}
            {formPlanType === 'COURSE' && (
              <div>
                <label className="block text-body-sm font-medium text-mp-gray-700 mb-1.5">
                  Курс
                </label>
                <select
                  value={formCourseId}
                  onChange={(e) => setFormCourseId(e.target.value)}
                  className="w-full rounded-lg border border-mp-gray-200 px-3 py-2 text-body-sm focus:outline-none focus:ring-2 focus:ring-mp-blue-500 focus:border-transparent"
                >
                  <option value="">Выберите курс...</option>
                  {courses.data?.map((c) => (
                    <option key={c.id} value={c.id}>{c.title}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Code mode: access days vs discount */}
            <div>
              <label className="block text-body-sm font-medium text-mp-gray-700 mb-1.5">
                Тип промо-кода
              </label>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setFormMode('duration')}
                  className={`px-4 py-2 rounded-lg text-body-sm font-medium border transition-colors ${
                    formMode === 'duration'
                      ? 'bg-mp-blue-50 border-mp-blue-300 text-mp-blue-700'
                      : 'border-mp-gray-200 text-mp-gray-600 hover:bg-mp-gray-50'
                  }`}
                >
                  Дни доступа
                </button>
                <button
                  type="button"
                  onClick={() => setFormMode('discount')}
                  className={`px-4 py-2 rounded-lg text-body-sm font-medium border transition-colors ${
                    formMode === 'discount'
                      ? 'bg-mp-blue-50 border-mp-blue-300 text-mp-blue-700'
                      : 'border-mp-gray-200 text-mp-gray-600 hover:bg-mp-gray-50'
                  }`}
                >
                  Скидка
                </button>
              </div>
            </div>

            {/* Duration (only in duration mode) */}
            {formMode === 'duration' && (
              <div>
                <label className="block text-body-sm font-medium text-mp-gray-700 mb-1.5">
                  Длительность (дней)
                </label>
                <div className="flex gap-2 flex-wrap">
                  {DURATION_PRESETS.map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => { setFormDuration(d); setFormCustomDuration(''); }}
                      className={`px-3 py-1.5 rounded-lg text-body-sm font-medium border transition-colors ${
                        formDuration === d && !formCustomDuration
                          ? 'bg-mp-blue-50 border-mp-blue-300 text-mp-blue-700'
                          : 'border-mp-gray-200 text-mp-gray-600 hover:bg-mp-gray-50'
                      }`}
                    >
                      {d}
                    </button>
                  ))}
                  <Input
                    inputSize="sm"
                    type="number"
                    min={1}
                    max={365}
                    placeholder="Другое"
                    value={formCustomDuration}
                    onChange={(e) => setFormCustomDuration(e.target.value)}
                    className="w-24"
                  />
                </div>
              </div>
            )}

            {/* Discount (only in discount mode) */}
            {formMode === 'discount' && (
              <div>
                <label className="block text-body-sm font-medium text-mp-gray-700 mb-1.5">
                  Размер скидки
                </label>
                <div className="flex gap-2 items-center flex-wrap">
                  <button
                    type="button"
                    onClick={() => setFormDiscountType('PERCENT')}
                    className={`px-3 py-1.5 rounded-lg text-body-sm font-medium border transition-colors ${
                      formDiscountType === 'PERCENT'
                        ? 'bg-mp-blue-50 border-mp-blue-300 text-mp-blue-700'
                        : 'border-mp-gray-200 text-mp-gray-600 hover:bg-mp-gray-50'
                    }`}
                  >
                    %
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormDiscountType('FIXED')}
                    className={`px-3 py-1.5 rounded-lg text-body-sm font-medium border transition-colors ${
                      formDiscountType === 'FIXED'
                        ? 'bg-mp-blue-50 border-mp-blue-300 text-mp-blue-700'
                        : 'border-mp-gray-200 text-mp-gray-600 hover:bg-mp-gray-50'
                    }`}
                  >
                    ₽
                  </button>
                  <Input
                    inputSize="sm"
                    type="number"
                    min={1}
                    max={formDiscountType === 'PERCENT' ? 100 : undefined}
                    placeholder={formDiscountType === 'PERCENT' ? 'до 100' : 'сумма'}
                    value={formDiscountValue}
                    onChange={(e) => setFormDiscountValue(e.target.value)}
                    className="w-28"
                  />
                </div>
                <p className="text-xs text-mp-gray-400 mt-1">
                  Скидка на первую оплату
                </p>
              </div>
            )}

            {/* Max Uses */}
            <div>
              <label className="block text-body-sm font-medium text-mp-gray-700 mb-1.5">
                Макс. активаций
              </label>
              <Input
                inputSize="sm"
                type="number"
                min={1}
                max={100000}
                value={formMaxUses}
                onChange={(e) => setFormMaxUses(parseInt(e.target.value, 10) || 1)}
                className="w-32"
              />
            </div>

            {/* Expiry */}
            <div>
              <label className="block text-body-sm font-medium text-mp-gray-700 mb-1.5">
                Срок действия
              </label>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 text-body-sm text-mp-gray-600 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formNoExpiry}
                    onChange={(e) => setFormNoExpiry(e.target.checked)}
                    className="rounded border-mp-gray-300"
                  />
                  Бессрочный
                </label>
                {!formNoExpiry && (
                  <Input
                    inputSize="sm"
                    type="date"
                    value={formExpiresAt}
                    onChange={(e) => setFormExpiresAt(e.target.value)}
                    className="w-44"
                  />
                )}
              </div>
            </div>

            {/* Custom Code */}
            <div>
              <label className="block text-body-sm font-medium text-mp-gray-700 mb-1.5">
                Код
              </label>
              <Input
                inputSize="sm"
                placeholder="Авто: PROMO-XXXXX"
                value={formCode}
                onChange={(e) => setFormCode(e.target.value.toUpperCase())}
                className="w-64 font-mono"
              />
              <p className="text-xs text-mp-gray-400 mt-1">
                Оставьте пустым для автогенерации
              </p>
            </div>

            {/* Submit */}
            <div className="flex gap-3 pt-2">
              <Button onClick={handleCreate} disabled={createPromo.isPending}>
                {createPromo.isPending ? 'Создание...' : 'Создать'}
              </Button>
              <Button
                variant="outline"
                onClick={() => { resetForm(); setShowForm(false); }}
              >
                Отмена
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Promo Codes Table */}
      <Card className="overflow-hidden">
        {promoCodes.isLoading ? (
          <div className="p-8 text-center text-mp-gray-500">Загрузка...</div>
        ) : promoCodes.error ? (
          <div className="p-8 text-center">
            <p className="text-red-600 font-medium">Ошибка загрузки</p>
            <p className="text-body-sm text-mp-gray-500 mt-1">{promoCodes.error.message}</p>
          </div>
        ) : !promoCodes.data?.length ? (
          <div className="p-8 text-center text-mp-gray-500">
            Нет промо-кодов. Создайте первый.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-mp-gray-200 bg-mp-gray-50">
                  <th className="text-left text-xs font-medium text-mp-gray-500 uppercase tracking-wider px-4 py-3">Код</th>
                  <th className="text-left text-xs font-medium text-mp-gray-500 uppercase tracking-wider px-4 py-3">Тип</th>
                  <th className="text-left text-xs font-medium text-mp-gray-500 uppercase tracking-wider px-4 py-3">Длительность</th>
                  <th className="text-left text-xs font-medium text-mp-gray-500 uppercase tracking-wider px-4 py-3">Использований</th>
                  <th className="text-left text-xs font-medium text-mp-gray-500 uppercase tracking-wider px-4 py-3">Истекает</th>
                  <th className="text-left text-xs font-medium text-mp-gray-500 uppercase tracking-wider px-4 py-3">Статус</th>
                  <th className="text-left text-xs font-medium text-mp-gray-500 uppercase tracking-wider px-4 py-3">Действия</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-mp-gray-100">
                {promoCodes.data.map((promo) => {
                  const status = getPromoStatus(promo);
                  const config = STATUS_CONFIG[status];
                  const isExpanded = expandedRow === promo.id;

                  return (
                    <PromoRow
                      key={promo.id}
                      promo={promo}
                      status={status}
                      statusConfig={config}
                      isExpanded={isExpanded}
                      onToggleExpand={() => setExpandedRow(isExpanded ? null : promo.id)}
                      onDeactivate={() => deactivatePromo.mutate({ id: promo.id })}
                      onCopyCode={() => copyCode(promo.code)}
                      formatDate={formatDate}
                      isDeactivating={deactivatePromo.isPending}
                    />
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

// Separated into its own component for expandable activations
function PromoRow({
  promo,
  status,
  statusConfig,
  isExpanded,
  onToggleExpand,
  onDeactivate,
  onCopyCode,
  formatDate,
  isDeactivating,
}: {
  promo: {
    id: string;
    code: string;
    planType: string;
    durationDays: number;
    discountType: 'PERCENT' | 'FIXED' | null;
    discountValue: number | null;
    currentUses: number;
    maxUses: number;
    expiresAt: string | Date | null;
    isActive: boolean;
    course: { id: string; title: string } | null;
    _count: { activations: number };
  };
  status: PromoStatus;
  statusConfig: { label: string; variant: string };
  isExpanded: boolean;
  onToggleExpand: () => void;
  onDeactivate: () => void;
  onCopyCode: () => void;
  formatDate: (d: string | Date | null) => string;
  isDeactivating: boolean;
}) {
  return (
    <>
      <tr className="hover:bg-mp-gray-50 transition-colors">
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            <code className="text-body-sm font-mono font-medium text-mp-gray-900">
              {promo.code}
            </code>
            <button
              onClick={onCopyCode}
              className="text-mp-gray-400 hover:text-mp-blue-500 transition-colors"
              title="Скопировать код"
            >
              <Copy className="w-3.5 h-3.5" />
            </button>
          </div>
        </td>
        <td className="px-4 py-3 text-body-sm text-mp-gray-600">
          {promo.planType === 'PLATFORM' ? 'Платформа' : promo.course?.title || 'Курс'}
        </td>
        <td className="px-4 py-3 text-body-sm text-mp-gray-600">
          {promo.discountType === 'PERCENT'
            ? `−${promo.discountValue}%`
            : promo.discountType === 'FIXED'
              ? `−${promo.discountValue} ₽`
              : `${promo.durationDays} дн.`}
        </td>
        <td className="px-4 py-3 text-body-sm text-mp-gray-600">
          {promo.currentUses}/{promo.maxUses}
        </td>
        <td className="px-4 py-3 text-body-sm text-mp-gray-600">
          {formatDate(promo.expiresAt)}
        </td>
        <td className="px-4 py-3">
          <Badge variant={statusConfig.variant as 'success' | 'default' | 'destructive'}>
            {statusConfig.label}
          </Badge>
        </td>
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            {status === 'active' && (
              <button
                onClick={onDeactivate}
                disabled={isDeactivating}
                className="text-xs text-red-600 hover:text-red-800 font-medium transition-colors disabled:opacity-50"
                title="Деактивировать"
              >
                <XCircle className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={onToggleExpand}
              className="flex items-center gap-1 text-xs text-mp-blue-600 hover:text-mp-blue-800 font-medium transition-colors"
            >
              Активации ({promo._count.activations})
              {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          </div>
        </td>
      </tr>
      {isExpanded && (
        <tr>
          <td colSpan={7} className="px-4 py-3 bg-mp-gray-50">
            <ActivationsDetail promoCodeId={promo.id} formatDate={formatDate} />
          </td>
        </tr>
      )}
    </>
  );
}

function ActivationsDetail({
  promoCodeId,
  formatDate,
}: {
  promoCodeId: string;
  formatDate: (d: string | Date | null) => string;
}) {
  const activations = trpc.promo.getPromoActivations.useQuery({ promoCodeId });

  if (activations.isLoading) {
    return <p className="text-body-sm text-mp-gray-500">Загрузка...</p>;
  }
  if (activations.error) {
    return <p className="text-body-sm text-red-600">Ошибка: {activations.error.message}</p>;
  }
  if (!activations.data?.length) {
    return <p className="text-body-sm text-mp-gray-500">Нет активаций</p>;
  }

  return (
    <table className="w-full text-body-sm">
      <thead>
        <tr className="text-left text-xs text-mp-gray-500 uppercase">
          <th className="pb-2 pr-4">Пользователь</th>
          <th className="pb-2 pr-4">Дата</th>
          <th className="pb-2">Статус подписки</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-mp-gray-100">
        {activations.data.map((a) => (
          <tr key={a.id}>
            <td className="py-2 pr-4 text-mp-gray-700">
              {a.user?.name || 'Без имени'}
            </td>
            <td className="py-2 pr-4 text-mp-gray-600">
              {formatDate(a.activatedAt)}
            </td>
            <td className="py-2">
              <Badge
                variant={a.subscription?.status === 'ACTIVE' ? 'success' : 'default'}
                size="sm"
              >
                {a.subscription?.status || 'N/A'}
              </Badge>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
