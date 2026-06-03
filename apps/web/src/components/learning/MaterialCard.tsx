'use client';

import { useState } from 'react';
import { FileText, Table, ExternalLink, ListChecks, StickyNote, Loader2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { trpc } from '@/lib/trpc/client';
import { reachGoal } from '@/lib/analytics/metrika';
import { METRIKA_GOALS } from '@/lib/analytics/constants';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

export type MaterialCardProps = {
  id: string;
  type: 'PRESENTATION' | 'CALCULATION_TABLE' | 'EXTERNAL_SERVICE' | 'CHECKLIST' | 'MEMO';
  title: string;
  description: string | null;
  ctaText: string;
  externalUrl: string | null;
  hasFile: boolean;
  /**
   * Урок, к которому прикреплён материал. Опционально (61-03 / A8):
   * standalone-материалы из «Базы знаний» рендерятся без lessonId и являются
   * externalUrl-only — для них getSignedUrl НЕ вызывается (download ACL frozen).
   */
  lessonId?: string;
  // Слот под FavoriteButton (монтируется в 61-07) — сердце пока не добавляем.
};

const TYPE_CONFIG = {
  PRESENTATION:      { Icon: FileText,     accent: 'bg-blue-50 text-blue-700 border-blue-200',       label: 'Презентация' },
  CALCULATION_TABLE: { Icon: Table,        accent: 'bg-purple-50 text-purple-700 border-purple-200', label: 'Таблица расчётов' },
  EXTERNAL_SERVICE:  { Icon: ExternalLink, accent: 'bg-orange-50 text-orange-700 border-orange-200', label: 'Внешний сервис' },
  CHECKLIST:         { Icon: ListChecks,   accent: 'bg-green-50 text-green-700 border-green-200',    label: 'Чек-лист' },
  MEMO:              { Icon: StickyNote,   accent: 'bg-gray-50 text-gray-700 border-gray-200',       label: 'Памятка' },
} as const;

export function MaterialCard({
  id,
  type,
  title,
  description,
  ctaText,
  externalUrl,
  hasFile,
  lessonId,
}: MaterialCardProps) {
  const [loading, setLoading] = useState(false);
  const utils = trpc.useUtils();

  const handleClick = async () => {
    reachGoal(METRIKA_GOALS.MATERIAL_OPEN, {
      materialId: id,
      materialType: type,
      // lessonId опционален у standalone-карточек — передаём только если есть.
      ...(lessonId ? { lessonId } : {}),
    });

    if (externalUrl) {
      window.open(externalUrl, '_blank', 'noopener,noreferrer');
      return;
    }

    // A8: standalone-материал (без lessonId) — externalUrl-only. Файловый
    // download-путь через getSignedUrl доступен только для урок-привязанных карточек.
    if (hasFile && lessonId) {
      setLoading(true);
      try {
        // Lazy fetch — only on click. Signed URL has TTL 3600s.
        const res = await utils.material.getSignedUrl.fetch({ materialId: id });
        window.open(res.signedUrl, '_blank', 'noopener,noreferrer');
      } catch (err) {
        const message = err instanceof Error ? err.message : '';
        if (message.includes('FORBIDDEN')) {
          toast.error('Доступ к материалу ограничен');
        } else if (message.includes('NOT_FOUND')) {
          toast.error('Материал больше недоступен');
        } else {
          toast.error('Не удалось открыть материал. Попробуйте ещё раз.');
        }
      } finally {
        setLoading(false);
      }
    }
  };

  const cfg = TYPE_CONFIG[type];
  const Icon = cfg.Icon;
  // Файловый download доступен только при наличии lessonId (A8 — standalone
  // externalUrl-only). Кнопка активна, если есть externalUrl ИЛИ (файл + урок).
  const canDownloadFile = hasFile && Boolean(lessonId);
  const disabled = loading || (!externalUrl && !canDownloadFile);

  return (
    <Card className="h-full flex flex-col shadow-mp-card">
      <CardContent className="p-4 flex flex-col gap-3 h-full">
        <div className="flex items-start gap-3">
          <div className={cn('p-2 rounded-md border shrink-0', cfg.accent)}>
            <Icon className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs text-mp-gray-500 mb-1">{cfg.label}</div>
            <div className="text-body font-semibold text-mp-gray-900 leading-tight">
              {title}
            </div>
          </div>
        </div>
        {description && (
          <p className="text-body-sm text-mp-gray-600 line-clamp-2">{description}</p>
        )}
        <div className="mt-auto pt-2">
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={handleClick}
            disabled={disabled}
            data-testid={`material-cta-${id}`}
          >
            {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            {ctaText}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
