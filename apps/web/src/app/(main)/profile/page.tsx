'use client';

import { useState, useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { trpc } from '@/lib/trpc/client';
import { cn } from '@/lib/utils';
import { SkillRadarChart } from '@/components/charts/RadarChart';
import { QualificationSection } from '@/components/profile/QualificationSection';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';

const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB
const AVATAR_MAX_DIM = 256;

/**
 * Resize and crop image to square webp via canvas.
 * Returns a Blob ready for upload.
 */
function resizeImageToWebp(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new window.Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const size = Math.min(img.width, img.height);
      const sx = (img.width - size) / 2;
      const sy = (img.height - size) / 2;

      const canvas = document.createElement('canvas');
      canvas.width = AVATAR_MAX_DIM;
      canvas.height = AVATAR_MAX_DIM;
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('Canvas not supported')); return; }

      ctx.drawImage(img, sx, sy, size, size, 0, 0, AVATAR_MAX_DIM, AVATAR_MAX_DIM);
      canvas.toBlob(
        (blob) => {
          if (!blob) { reject(new Error('toBlob failed')); return; }
          resolve(blob);
        },
        'image/webp',
        0.85,
      );
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Image load failed')); };
    img.src = url;
  });
}

/** Extract storage path from a Supabase public URL */
function extractAvatarPath(publicUrl: string): string | null {
  const match = publicUrl.match(/\/avatars\/(.+)$/);
  return match ? match[1] : null;
}

const formatDate = (date: string | Date) =>
  new Date(date).toLocaleDateString('ru-RU');

const formatPrice = (amount: number) =>
  new Intl.NumberFormat('ru-RU').format(amount);

const paymentStatusMap: Record<string, { label: string; variant: 'success' | 'destructive' | 'warning' }> = {
  COMPLETED: { label: 'Оплачен', variant: 'success' },
  FAILED: { label: 'Отклонён', variant: 'destructive' },
  REFUNDED: { label: 'Возврат', variant: 'warning' },
  PENDING: { label: 'Ожидание', variant: 'warning' },
};

const subscriptionStatusMap: Record<string, { label: string; variant: 'success' | 'warning' | 'destructive' }> = {
  ACTIVE: { label: 'Активна', variant: 'success' },
  TRIAL: { label: 'Триал', variant: 'success' },
  PAST_DUE: { label: 'Просрочена', variant: 'warning' },
  CANCELLED: { label: 'Отменена', variant: 'destructive' },
};

function SecurityCard({
  hasPassword,
  oauthProviders,
}: {
  hasPassword: boolean;
  oauthProviders: string[];
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const providerLabel = (p: string) => (p === 'yandex' ? 'Yandex ID' : p);

  // OAuth-only users (no email/password identity) — password is on the provider side
  if (!hasPassword) {
    const label = oauthProviders.map(providerLabel).join(', ') || 'провайдера';
    return (
      <Card className="shadow-mp-card">
        <CardHeader>
          <CardTitle className="text-heading">Безопасность</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-body-sm text-mp-gray-700">
            Вы входите через <span className="font-medium">{label}</span>. У этого аккаунта нет отдельного
            пароля на платформе — управление логином происходит на стороне провайдера.
          </p>
        </CardContent>
      </Card>
    );
  }

  const handleSubmit = async () => {
    if (password.length < 8) {
      toast.error('Пароль должен быть минимум 8 символов');
      return;
    }
    if (password !== confirm) {
      toast.error('Пароли не совпадают');
      return;
    }
    setIsSaving(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        const msg = (error.message || '').toLowerCase();
        if (msg.includes('same') && msg.includes('password')) {
          toast.error('Новый пароль совпадает с текущим');
        } else if (msg.includes('weak')) {
          toast.error('Слишком простой пароль', { description: 'Используйте комбинацию букв и цифр' });
        } else if (msg.includes('session')) {
          toast.error('Сессия истекла', { description: 'Войдите заново и повторите попытку' });
        } else {
          toast.error('Не удалось сменить пароль', { description: error.message });
        }
        return;
      }
      toast.success('Пароль обновлён');
      setPassword('');
      setConfirm('');
      setIsOpen(false);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card className="shadow-mp-card">
      <CardHeader>
        <CardTitle className="text-heading">Безопасность</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {!isOpen ? (
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="font-medium text-mp-gray-900">Пароль</div>
              <p className="text-body-sm text-mp-gray-500">Обновите пароль для входа в аккаунт</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => setIsOpen(true)}>
              Сменить пароль
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <label className="block text-body-sm font-medium text-mp-gray-700 mb-2">
                Новый пароль
              </label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Минимум 8 символов"
                minLength={8}
                autoComplete="new-password"
              />
            </div>
            <div>
              <label className="block text-body-sm font-medium text-mp-gray-700 mb-2">
                Повторите пароль
              </label>
              <Input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="Повторите пароль"
                minLength={8}
                autoComplete="new-password"
              />
            </div>
            <div className="flex gap-2">
              <Button onClick={handleSubmit} disabled={isSaving}>
                {isSaving ? 'Сохранение...' : 'Сохранить пароль'}
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setIsOpen(false);
                  setPassword('');
                  setConfirm('');
                }}
                disabled={isSaving}
              >
                Отмена
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function ProfilePage() {
  const [name, setName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [cancelMessage, setCancelMessage] = useState('');
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: profile, refetch } = trpc.profile.get.useQuery();
  const { data: skillProfile } = trpc.profile.getSkillProfile.useQuery();
  const { data: referralState } = trpc.referral.getMyState.useQuery();

  // Billing queries
  const { data: billingEnabled } = trpc.billing.isEnabled.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  });
  const { data: subscription, refetch: refetchSubscription } = trpc.billing.getSubscription.useQuery(undefined, {
    enabled: !!billingEnabled,
    retry: false,
  });
  const { data: payments } = trpc.billing.getPaymentHistory.useQuery(
    { limit: 5 },
    { enabled: !!billingEnabled, retry: false },
  );

  const cancelSubscription = trpc.billing.cancelSubscription.useMutation({
    onSuccess: (data) => {
      setCancelMessage(
        `Подписка отменена. Доступ сохранится до ${formatDate(data.accessUntil)}.`
      );
      toast.success('Подписка отменена', {
        description: `Доступ сохранится до ${formatDate(data.accessUntil)}.`,
      });
      refetchSubscription();
    },
    onError: (err) => {
      setCancelMessage(`Ошибка: ${err.message}`);
      toast.error('Не удалось отменить подписку', { description: err.message });
    },
  });

  const updateProfile = trpc.profile.update.useMutation({
    onSuccess: () => {
      refetch();
      setIsSaving(false);
    },
  });

  const deleteAvatarMutation = trpc.profile.deleteAvatar.useMutation({
    onSuccess: () => {
      refetch();
    },
  });

  const handleSave = () => {
    if (!name.trim()) return;
    setIsSaving(true);
    updateProfile.mutate({ name });
  };

  const handleAvatarSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset input so same file can be re-selected
    if (fileInputRef.current) fileInputRef.current.value = '';

    if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
      toast.error('Неверный формат', { description: 'Загрузите JPG, PNG или WebP' });
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      toast.error('Файл слишком большой', { description: 'Максимум 2 МБ' });
      return;
    }

    setIsUploading(true);
    try {
      const blob = await resizeImageToWebp(file);
      const localUrl = URL.createObjectURL(blob);
      setAvatarPreview(localUrl);

      const userId = profile?.id;
      if (!userId) throw new Error('Profile not loaded');

      const supabase = createClient();
      const timestamp = Date.now();
      const path = `${userId}/${timestamp}.webp`;

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(path, blob, { contentType: 'image/webp', upsert: false });

      if (uploadError) {
        toast.error('Ошибка загрузки', { description: uploadError.message });
        setAvatarPreview(null);
        return;
      }

      const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path);
      await updateProfile.mutateAsync({ avatarUrl: urlData.publicUrl });
      toast.success('Фото обновлено');
      refetch();
    } catch (err: any) {
      toast.error('Ошибка загрузки', { description: err.message || 'Попробуйте ещё раз' });
      setAvatarPreview(null);
    } finally {
      setIsUploading(false);
    }
  };

  const handleDeleteAvatar = async () => {
    if (!profile?.avatarUrl) return;
    setIsDeleting(true);
    try {
      const path = extractAvatarPath(profile.avatarUrl);
      if (path) {
        const supabase = createClient();
        await supabase.storage.from('avatars').remove([path]);
        await deleteAvatarMutation.mutateAsync({ path });
      } else {
        // No path extracted — just clear DB
        await updateProfile.mutateAsync({ avatarUrl: null });
      }
      setAvatarPreview(null);
      toast.success('Фото удалено');
      refetch();
    } catch (err: any) {
      toast.error('Ошибка удаления', { description: err.message || 'Попробуйте ещё раз' });
    } finally {
      setIsDeleting(false);
    }
  };

  const currentAvatarUrl = avatarPreview || profile?.avatarUrl;
  const avatarInitial = profile?.name?.charAt(0)?.toUpperCase() || 'U';

  const handleCancelSubscription = () => {
    if (!confirm('Вы уверены, что хотите отменить подписку? Доступ сохранится до конца оплаченного периода.')) {
      return;
    }
    setCancelMessage('');
    cancelSubscription.mutate();
  };

  const hasActiveSubscription =
    subscription && ['ACTIVE', 'TRIAL', 'PAST_DUE', 'CANCELLED'].includes(subscription.status);

  const isPromoSubscription = subscription?.promoCodeId != null;

  return (
    <div className="max-w-4xl mx-auto space-y-6 overflow-hidden">
      <div>
        <h1 className="text-display-sm text-mp-gray-900">Профиль</h1>
        <p className="text-body text-mp-gray-500 mt-1">Настройки аккаунта и статистика</p>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        {/* Left column */}
        <div className="md:col-span-2 space-y-6">
          {/* Avatar upload */}
          <Card className="shadow-mp-card">
            <CardHeader>
              <CardTitle className="text-heading">Фото профиля</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-6">
                {/* Avatar preview */}
                <div className="w-24 h-24 rounded-full overflow-hidden bg-gradient-to-br from-mp-blue-500 to-mp-blue-600 flex items-center justify-center shrink-0">
                  {currentAvatarUrl ? (
                    <Image
                      src={currentAvatarUrl}
                      alt="Аватар"
                      width={96}
                      height={96}
                      className="w-full h-full object-cover"
                      unoptimized
                    />
                  ) : (
                    <span className="text-white text-2xl font-semibold">{avatarInitial}</span>
                  )}
                </div>

                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Button
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isUploading || isDeleting}
                      size="sm"
                    >
                      {isUploading ? (
                        <>
                          <svg className="animate-spin -ml-1 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                          </svg>
                          Загрузка...
                        </>
                      ) : (
                        'Загрузить фото'
                      )}
                    </Button>
                    {profile?.avatarUrl && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                        onClick={handleDeleteAvatar}
                        disabled={isUploading || isDeleting}
                      >
                        {isDeleting ? 'Удаление...' : 'Удалить'}
                      </Button>
                    )}
                  </div>
                  <p className="text-body-xs text-mp-gray-500">JPG, PNG или WebP, до 2 МБ</p>
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={handleAvatarSelect}
                />
              </div>
            </CardContent>
          </Card>

          {/* Profile info */}
          <Card className="shadow-mp-card">
            <CardHeader>
              <CardTitle className="text-heading">Личные данные</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="block text-body-sm font-medium text-mp-gray-700 mb-2">
                  Email
                </label>
                <Input
                  type="email"
                  value={profile?.email || ''}
                  readOnly
                  disabled
                  className="bg-mp-gray-50 text-mp-gray-700"
                />
                <p className="text-body-xs text-mp-gray-500 mt-1.5">
                  Чтобы сменить email, напишите в поддержку.
                </p>
              </div>
              <div>
                <label className="block text-body-sm font-medium text-mp-gray-700 mb-2">
                  Имя
                </label>
                <Input
                  type="text"
                  defaultValue={profile?.name || ''}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Введите имя"
                />
              </div>
              <Button onClick={handleSave} disabled={isSaving}>
                {isSaving ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Сохранение...
                  </>
                ) : (
                  'Сохранить'
                )}
              </Button>
            </CardContent>
          </Card>

          {/* Security — change password (or info for OAuth users) */}
          <SecurityCard
            hasPassword={profile?.hasPassword ?? false}
            oauthProviders={profile?.oauthProviders ?? []}
          />

          {/* Квалификация — редактирование данных онбординга */}
          <QualificationSection />


          {/* Subscription section — only if billing enabled */}
          {billingEnabled && (
            <div className="space-y-4">
              {/* Subscription card */}
              {hasActiveSubscription ? (
                <Card className="shadow-mp-card overflow-hidden">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-heading">Подписка</CardTitle>
                      <Badge variant={isPromoSubscription ? 'featured' : (subscriptionStatusMap[subscription.status]?.variant || 'default')}>
                        {isPromoSubscription ? 'Промо' : (subscriptionStatusMap[subscription.status]?.label || subscription.status)}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <div className="flex justify-between gap-4 text-body-sm min-w-0">
                        <span className="text-mp-gray-500 shrink-0">Тариф</span>
                        <span className="font-medium text-mp-gray-900 truncate">{subscription.plan.name}</span>
                      </div>
                      {isPromoSubscription ? (
                        <div className="flex justify-between gap-4 text-body-sm">
                          <span className="text-mp-gray-500 shrink-0">Тип</span>
                          <span className="font-medium text-mp-gray-900">Промо-доступ</span>
                        </div>
                      ) : (
                        <div className="flex justify-between gap-4 text-body-sm">
                          <span className="text-mp-gray-500 shrink-0">Стоимость</span>
                          <span className="font-medium text-mp-gray-900">
                            {formatPrice(subscription.plan.price)} / мес
                          </span>
                        </div>
                      )}
                      {subscription.plan.type === 'COURSE' && subscription.course && (
                        <div className="flex justify-between gap-4 text-body-sm min-w-0">
                          <span className="text-mp-gray-500 shrink-0">Курс</span>
                          <span className="font-medium text-mp-gray-900 truncate">{subscription.course.title}</span>
                        </div>
                      )}
                      <div className="flex justify-between gap-4 text-body-sm">
                        <span className="text-mp-gray-500 shrink-0">
                          {subscription.status === 'CANCELLED' || subscription.status === 'TRIAL' || isPromoSubscription ? 'Доступ до' : 'Следующее списание'}
                        </span>
                        <span className="font-medium text-mp-gray-900">
                          {formatDate(subscription.currentPeriodEnd)}
                        </span>
                      </div>
                    </div>

                    {cancelMessage && (
                      <div className="p-3 rounded-lg bg-mp-green-50 text-mp-green-800 text-body-sm border border-mp-green-200">
                        {cancelMessage}
                      </div>
                    )}

                    {subscription.status === 'ACTIVE' && !isPromoSubscription && (
                      <Button
                        variant="outline"
                        className="text-red-600 border-red-200 hover:bg-red-50"
                        onClick={handleCancelSubscription}
                        disabled={cancelSubscription.isPending}
                      >
                        {cancelSubscription.isPending ? 'Отмена...' : 'Отменить подписку'}
                      </Button>
                    )}
                  </CardContent>
                </Card>
              ) : (
                <Card className="shadow-mp-card border-dashed">
                  <CardContent className="py-8 text-center">
                    <div className="w-12 h-12 rounded-xl bg-mp-gray-100 flex items-center justify-center mx-auto mb-3">
                      <svg className="w-6 h-6 text-mp-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h.01M11 15h2M7 15a1 1 0 100-2 1 1 0 000 2zM3 6a2 2 0 012-2h14a2 2 0 012 2v12a2 2 0 01-2 2H5a2 2 0 01-2-2V6z" />
                      </svg>
                    </div>
                    <p className="text-body text-mp-gray-500 mb-4">У вас нет активной подписки</p>
                    <Link href="/pricing">
                      <Button>Выбрать тариф</Button>
                    </Link>
                  </CardContent>
                </Card>
              )}

              {/* Payment history */}
              {payments && payments.length > 0 && (
                <Card className="shadow-mp-card overflow-hidden">
                  <CardHeader>
                    <CardTitle className="text-heading">История платежей</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <table className="w-full text-body-sm">
                        <thead>
                          <tr className="border-b border-mp-gray-200">
                            <th className="text-left py-2 text-mp-gray-500 font-medium whitespace-nowrap pr-3">Дата</th>
                            <th className="text-left py-2 text-mp-gray-500 font-medium whitespace-nowrap pr-3">Сумма</th>
                            <th className="text-left py-2 text-mp-gray-500 font-medium whitespace-nowrap pr-3">Статус</th>
                            <th className="text-left py-2 text-mp-gray-500 font-medium">План</th>
                          </tr>
                        </thead>
                        <tbody>
                          {payments.map((payment) => {
                            const status = paymentStatusMap[payment.status] || {
                              label: payment.status,
                              variant: 'default' as const,
                            };
                            return (
                              <tr key={payment.id} className="border-b border-mp-gray-100 last:border-0">
                                <td className="py-3 text-mp-gray-900 whitespace-nowrap pr-3">{formatDate(payment.createdAt)}</td>
                                <td className="py-3 text-mp-gray-900 whitespace-nowrap pr-3">{formatPrice(payment.amount)} ₽</td>
                                <td className="py-3 pr-3">
                                  <Badge variant={status.variant} size="sm">{status.label}</Badge>
                                </td>
                                <td className="py-3 text-mp-gray-700 max-w-[150px]">
                                  <div className="truncate">{payment.subscription?.plan?.name || '-'}</div>
                                  {payment.subscription?.course && (
                                    <div className="text-mp-gray-500 text-xs truncate">{payment.subscription.course.title}</div>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              )}

              {payments && payments.length === 0 && (
                <Card className="shadow-mp-card">
                  <CardHeader>
                    <CardTitle className="text-heading">История платежей</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-body-sm text-mp-gray-500">История платежей пуста</p>
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {/* Quick links */}
          <Card className="shadow-mp-card">
            <CardHeader>
              <CardTitle className="text-heading">Быстрые действия</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Link
                href="/profile/history"
                className="flex items-center justify-between p-4 border border-mp-gray-200 rounded-xl hover:bg-mp-gray-50 hover:border-mp-blue-300 transition-all duration-200"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-mp-blue-100 flex items-center justify-center">
                    <svg className="w-5 h-5 text-mp-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                    </svg>
                  </div>
                  <div>
                    <div className="font-medium text-mp-gray-900">История диагностик</div>
                    <div className="text-body-sm text-mp-gray-500">Все пройденные тесты</div>
                  </div>
                </div>
                <svg className="w-5 h-5 text-mp-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Link>

              <Link
                href="/diagnostic"
                className="flex items-center justify-between p-4 border border-mp-gray-200 rounded-xl hover:bg-mp-gray-50 hover:border-mp-green-300 transition-all duration-200"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-mp-green-100 flex items-center justify-center">
                    <svg className="w-5 h-5 text-mp-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                  </div>
                  <div>
                    <div className="font-medium text-mp-gray-900">Пройти диагностику</div>
                    <div className="text-body-sm text-mp-gray-500">Обновить профиль навыков</div>
                  </div>
                </div>
                <svg className="w-5 h-5 text-mp-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Link>

              <Link
                href="/learn"
                className="flex items-center justify-between p-4 border border-mp-gray-200 rounded-xl hover:bg-mp-gray-50 hover:border-mp-pink-300 transition-all duration-200"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-mp-pink-100 flex items-center justify-center">
                    <svg className="w-5 h-5 text-mp-pink-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                    </svg>
                  </div>
                  <div>
                    <div className="font-medium text-mp-gray-900">Продолжить обучение</div>
                    <div className="text-body-sm text-mp-gray-500">Персональный план уроков</div>
                  </div>
                </div>
                <svg className="w-5 h-5 text-mp-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            </CardContent>
          </Card>

          {/* Phase 51 — link to /profile/notifications */}
          <Card className="shadow-mp-card">
            <CardContent className="py-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-heading text-mp-gray-900">Уведомления</h2>
                  <p className="text-body-sm text-mp-gray-500 mt-1">
                    Выбери, какие уведомления получать и куда отправлять.
                  </p>
                </div>
                <Link
                  href="/profile/notifications"
                  className="text-body-sm text-mp-blue-600 hover:underline whitespace-nowrap"
                >
                  Настроить →
                </Link>
              </div>
            </CardContent>
          </Card>

          {/* Phase 53A — link to /profile/referral */}
          <Card className={cn(
            'shadow-mp-card',
            (referralState?.pendingPackages.length ?? 0) > 0 && 'ring-2 ring-mp-blue-200',
          )}>
            <CardContent className="py-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-heading text-mp-gray-900">Реферальная программа</h2>
                    {(referralState?.pendingPackages.length ?? 0) > 0 && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-mp-blue-50 text-mp-blue-700 text-xs font-semibold">
                        🎁 +{referralState!.pendingPackages.reduce((s, p) => s + p.days, 0)} дн
                      </span>
                    )}
                  </div>
                  <p className="text-body-sm text-mp-gray-500 mt-1">
                    {(referralState?.pendingPackages.length ?? 0) > 0
                      ? `У тебя ${referralState!.pendingPackages.length} ${referralState!.pendingPackages.length === 1 ? 'пакет' : 'пакета'} — активируй и продли подписку.`
                      : 'Твоя реф-ссылка и накопленные пакеты.'}
                  </p>
                </div>
                <Link
                  href="/profile/referral"
                  className={cn(
                    'text-body-sm hover:underline whitespace-nowrap',
                    (referralState?.pendingPackages.length ?? 0) > 0
                      ? 'text-mp-blue-600 font-semibold'
                      : 'text-mp-blue-600',
                  )}
                >
                  {(referralState?.pendingPackages.length ?? 0) > 0 ? 'Активировать →' : 'Открыть →'}
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right column */}
        <div className="space-y-6">
          {/* Skill profile */}
          <Card className="shadow-mp-card">
            <CardHeader>
              <CardTitle className="text-heading">Профиль навыков</CardTitle>
              <CardDescription className="text-body-sm">Последний результат диагностики</CardDescription>
            </CardHeader>
            <CardContent>
              {skillProfile ? (
                <SkillRadarChart data={skillProfile} showLabels={false} />
              ) : (
                <div className="h-48 flex items-center justify-center border-2 border-dashed border-mp-gray-200 rounded-xl bg-mp-gray-50">
                  <div className="text-center">
                    <div className="w-12 h-12 rounded-xl bg-mp-gray-200 flex items-center justify-center mx-auto mb-3">
                      <svg className="w-6 h-6 text-mp-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                      </svg>
                    </div>
                    <p className="text-body-sm text-mp-gray-500 mb-2">Нет данных</p>
                    <Link href="/diagnostic">
                      <Button variant="link" size="sm" className="text-mp-blue-600">
                        Пройти тест
                      </Button>
                    </Link>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Account info */}
          <Card variant="soft-blue" className="shadow-mp-card">
            <CardContent className="py-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full overflow-hidden bg-gradient-to-br from-mp-blue-500 to-mp-blue-600 flex items-center justify-center">
                  {currentAvatarUrl ? (
                    <Image
                      src={currentAvatarUrl}
                      alt="Аватар"
                      width={40}
                      height={40}
                      className="w-full h-full object-cover"
                      unoptimized
                    />
                  ) : (
                    <span className="text-white font-semibold">{avatarInitial}</span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-mp-gray-900 truncate">
                    {profile?.name || 'Пользователь'}
                  </div>
                  <div className="text-body-sm text-mp-gray-500 truncate" title={profile?.email || ''}>
                    {profile?.email || `ID: ${profile?.id?.slice(0, 8)}...`}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
