'use client';

import { useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { FavoriteButton } from '@/components/learning/FavoriteButton';
import { trpc } from '@/lib/trpc/client';
import type { AssistantLessonRef, AssistantJobRef, AssistantNavLink, AssistantMaterialRef } from '@mpstats/ai';

interface Props {
  lessons: AssistantLessonRef[];
  jobs: AssistantJobRef[];
  navLinks?: AssistantNavLink[];
  materials?: AssistantMaterialRef[];
  favoritedKeys: Set<string>; // "LESSON:<id>" / "JOB:<id>" / "MATERIAL:<id>"
}

// type → эмодзи-иконка (MaterialType).
const MATERIAL_TYPE_ICON: Record<string, string> = {
  CALCULATION_TABLE: '📊',
  CHECKLIST: '✅',
  MEMO: '📄',
  PRESENTATION: '🖼',
  EXTERNAL_SERVICE: '🔗',
};

export function AssistantCards({ lessons, jobs, navLinks = [], materials = [], favoritedKeys }: Props) {
  if (lessons.length === 0 && jobs.length === 0 && navLinks.length === 0 && materials.length === 0) return null;

  return (
    <div className="mt-2 space-y-2">
      {jobs.map((j) => (
        <div
          key={`J:${j.jobId}`}
          className="flex items-center gap-3 rounded-lg border-l-2 border-l-[#4338ca] bg-[#f5f6ff] p-2.5"
        >
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-bold uppercase tracking-wide text-[#4338ca]">Задача</div>
            <Link
              href={`/learn/job/${j.slug}`}
              className="block truncate text-sm font-semibold text-mp-gray-900 hover:underline"
            >
              {j.title}
            </Link>
            <div className="text-xs text-mp-gray-500">{j.lessonCount} уроков · собери план</div>
          </div>
          <FavoriteButton itemType="JOB" itemId={j.jobId} initialFavorited={favoritedKeys.has(`JOB:${j.jobId}`)} />
        </div>
      ))}

      {lessons.map((l) => (
        <div
          key={`L:${l.lessonId}`}
          className="flex items-center gap-3 rounded-lg border border-mp-gray-200 bg-white p-2.5"
        >
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-bold uppercase tracking-wide text-mp-gray-400">Урок</div>
            <Link
              href={`/learn/${l.lessonId}?from=assistant`}
              className="block truncate text-sm font-semibold text-mp-gray-900 hover:underline"
            >
              {l.title}
            </Link>
            <div className="text-xs text-mp-gray-500">
              {l.durationMin ? `${l.durationMin} мин` : ''}
              {l.courseTitle ? ` · ${l.courseTitle}` : ''}
            </div>
          </div>
          <FavoriteButton
            itemType="LESSON"
            itemId={l.lessonId}
            initialFavorited={favoritedKeys.has(`LESSON:${l.lessonId}`)}
          />
        </div>
      ))}

      {navLinks.map((n) => (
        <Link
          key={`N:${n.href}`}
          href={n.href}
          className="flex items-center gap-3 rounded-lg border border-mp-blue-200 bg-mp-blue-50 p-2.5 hover:bg-mp-blue-100"
        >
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-bold uppercase tracking-wide text-mp-blue-500">Перейти</div>
            <div className="truncate text-sm font-semibold text-mp-blue-700">{n.label}</div>
          </div>
          <svg className="h-4 w-4 shrink-0 text-mp-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </Link>
      ))}

      {materials.map((mat) => (
        <div
          key={`M:${mat.materialId}`}
          className="flex items-center gap-3 rounded-lg border border-mp-gray-200 bg-white p-2.5"
        >
          <span className="shrink-0 text-lg" aria-hidden>
            {MATERIAL_TYPE_ICON[mat.type] ?? '📎'}
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-bold uppercase tracking-wide text-mp-gray-400">Материал</div>
            <div className="truncate text-sm font-semibold text-mp-gray-900">{mat.title}</div>
            <MaterialCta material={mat} />
          </div>
          <FavoriteButton
            itemType="MATERIAL"
            itemId={mat.materialId}
            initialFavorited={favoritedKeys.has(`MATERIAL:${mat.materialId}`)}
          />
        </div>
      ))}
    </div>
  );
}

const CTA_CLASS = 'text-xs font-semibold text-mp-blue-600 hover:underline';

function MaterialCta({ material }: { material: AssistantMaterialRef }) {
  // Залоченный материал: бэкенд занулил externalUrl — карточка ничего не грузит/не открывает,
  // единственный аффорданс — оформить доступ.
  if (!material.isAccessible) {
    return (
      <Link href="/billing" className={CTA_CLASS}>
        🔒 Оформить доступ
      </Link>
    );
  }

  if (material.externalUrl) {
    return (
      <a href={material.externalUrl} target="_blank" rel="noopener noreferrer" className={CTA_CLASS}>
        {material.ctaText}
      </a>
    );
  }

  if (material.hasFile) {
    return <MaterialDownloadButton materialId={material.materialId} ctaText={material.ctaText} />;
  }

  return null;
}

function MaterialDownloadButton({ materialId, ctaText }: { materialId: string; ctaText: string }) {
  const utils = trpc.useUtils();
  const [loading, setLoading] = useState(false);

  const handleDownload = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const { signedUrl } = await utils.material.getSignedUrl.fetch({ materialId });
      const opened = window.open(signedUrl, '_blank', 'noopener,noreferrer');
      if (!opened) {
        toast.error('Не удалось открыть файл. Проверьте, разрешены ли всплывающие окна.');
        return;
      }
    } catch (err) {
      console.error('[MaterialDownload] fetch failed:', err);
      toast.error('Не удалось получить файл. Попробуйте ещё раз.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <button type="button" onClick={handleDownload} disabled={loading} className={`${CTA_CLASS} disabled:opacity-50 disabled:no-underline`}>
      {loading ? 'Загрузка…' : ctaText || 'Скачать'}
    </button>
  );
}
