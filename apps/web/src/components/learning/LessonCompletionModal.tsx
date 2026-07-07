'use client';

import Link from 'next/link';
import type { LessonContextKind } from '@mpstats/shared';

interface Props {
  kind: LessonContextKind;
  label: string;
  returnHref: string;
  onStay: () => void;
  showDiagnosticCta?: boolean;
}

const TITLE: Record<LessonContextKind, string> = {
  job: 'Задача пройдена',
  course: 'Курс пройден',
  plan: 'Урок пройден',
  favorites: 'Урок пройден',
  storefront: 'Урок пройден',
};
const SUBTITLE: Record<LessonContextKind, string> = {
  job: 'Вы прошли все уроки задачи — отличная работа',
  course: 'Вы прошли курс целиком',
  plan: 'Вы на шаг ближе к цели',
  favorites: 'Вы на шаг ближе к цели',
  storefront: 'Вы на шаг ближе к цели',
};
const PRIMARY_LABEL: Record<LessonContextKind, string> = {
  job: 'Вернуться к задаче',
  course: 'Вернуться к курсу',
  plan: 'К персональному плану',
  favorites: 'В избранное',
  storefront: 'На главную',
};

export function LessonCompletionModal({ kind, label, returnHref, onStay, showDiagnosticCta }: Props) {
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      onClick={onStay}
    >
      <div
        className="relative w-full max-w-md rounded-2xl bg-white p-6 sm:p-8 text-center shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onStay}
          aria-label="Закрыть"
          className="absolute right-4 top-4 text-mp-gray-400 hover:text-mp-gray-600"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-mp-green-100 text-mp-green-600">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>

        <h2 className="text-xl font-bold text-mp-gray-900">{TITLE[kind]}</h2>
        <p className="mt-2 text-sm text-mp-gray-500">{SUBTITLE[kind]}</p>

        <div className="mt-6 flex flex-col gap-2">
          <Link
            href={returnHref}
            className="w-full rounded-xl bg-mp-blue-600 px-4 py-3 font-medium text-white hover:bg-mp-blue-700 transition-colors"
          >
            {PRIMARY_LABEL[kind]}
          </Link>
          {showDiagnosticCta && (
            <Link
              href="/diagnostic"
              className="w-full rounded-xl bg-mp-green-50 px-4 py-3 font-medium text-mp-green-700 hover:bg-mp-green-100 transition-colors"
            >
              Собрать персональный план → диагностика (10 мин)
            </Link>
          )}
          {kind === 'plan' ? (
            <button
              onClick={onStay}
              className="w-full rounded-xl border border-mp-gray-200 px-4 py-3 font-medium text-mp-gray-700 hover:bg-mp-gray-50 transition-colors"
            >
              Остаться на уроке
            </button>
          ) : (
            <Link
              href="/learn/plan"
              className="w-full rounded-xl border border-mp-gray-200 px-4 py-3 font-medium text-mp-gray-700 hover:bg-mp-gray-50 transition-colors"
            >
              К персональному плану
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
