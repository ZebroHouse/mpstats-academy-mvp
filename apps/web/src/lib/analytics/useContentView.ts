'use client';

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { accumulateActiveSeconds } from '@mpstats/shared';
import { trpc } from '@/lib/trpc/client';

/** Реже, чем saveWatchProgress (15с): журналу не нужна свежесть, нужна полнота. */
const PING_INTERVAL_MS = 60_000;
/** Такт собственного тикера для уроков без плеера. */
const SELF_TICK_MS = 1_000;
/** Ниже секунды писать нечего — это открыл и сразу закрыл. */
const MIN_REPORTABLE_SECONDS = 1;

/**
 * Журнал заходов в урок. Полностью побочный: если startView не сработал
 * (флаг выключен, урок не найден, БД недоступна), viewId остаётся null и хук
 * молча ничего не делает — страница урока об этом не знает.
 *
 * Пинг шлёт НАКОПЛЕННОЕ с начала просмотра, а не дельту: потерянный пинг
 * тогда не теряет данные, следующий их догоняет.
 */
export function useContentView(lessonId: string, options: { hasPlayer?: boolean } = {}) {
  const hasPlayer = options.hasPlayer ?? false;

  const viewIdRef = useRef<string | null>(null);
  const activeSecondsRef = useRef(0);
  const percentRef = useRef(0);
  const prevPositionRef = useRef(0);
  const prevTickAtRef = useRef<number | null>(null);

  const startView = trpc.contentView.startView.useMutation();
  const pingView = trpc.contentView.pingView.useMutation();

  // useMutation возвращает нестабильные ссылки — в deps их класть нельзя,
  // иначе бесконечный цикл ре-рендеров (тот же паттерн, что у saveWatchProgress).
  const startRef = useRef(startView);
  startRef.current = startView;
  const pingRef = useRef(pingView);
  pingRef.current = pingView;

  // Смена урока = новый просмотр: сбрасываем всё и заводим строку заново.
  useEffect(() => {
    viewIdRef.current = null;
    activeSecondsRef.current = 0;
    percentRef.current = 0;
    prevPositionRef.current = 0;
    prevTickAtRef.current = null;

    let cancelled = false;
    startRef.current
      .mutateAsync({ lessonId })
      .then((r) => { if (!cancelled) viewIdRef.current = r.viewId; })
      .catch(() => { /* журнал не мешает уроку */ });

    return () => { cancelled = true; };
  }, [lessonId]);

  const flush = useCallback(() => {
    const viewId = viewIdRef.current;
    if (!viewId) return;
    if (activeSecondsRef.current < MIN_REPORTABLE_SECONDS) return;
    pingRef.current.mutate({
      viewId,
      activeSeconds: Math.round(activeSecondsRef.current),
      percent: Math.round(percentRef.current),
      completed: percentRef.current >= 90,
    });
  }, []);

  const trackPosition = useCallback((position: number, duration: number) => {
    const now = Date.now();
    const prevAt = prevTickAtRef.current;
    prevTickAtRef.current = now;

    if (prevAt !== null) {
      activeSecondsRef.current = accumulateActiveSeconds({
        prevPosition: prevPositionRef.current,
        nextPosition: position,
        elapsedMs: now - prevAt,
        prevActiveSeconds: activeSecondsRef.current,
      });
    }
    prevPositionRef.current = position;
    if (duration > 0) {
      percentRef.current = Math.min(100, (position / duration) * 100);
    }
  }, []);

  // Периодический пинг + досылка при уходе. visibilitychange надёжнее
  // beforeunload на iOS Safari, поэтому слушаем оба.
  useEffect(() => {
    const interval = setInterval(flush, PING_INTERVAL_MS);
    const onVisibility = () => { if (document.visibilityState === 'hidden') flush(); };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', flush);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, [flush]);

  // Уроки без плеера: тикаем сами, пока вкладка видима. Синтетическая позиция
  // растёт на секунду за такт, поэтому накопитель из shared работает как есть.
  useEffect(() => {
    if (hasPlayer) return;
    const interval = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      trackPosition(prevPositionRef.current + 1, 0);
    }, SELF_TICK_MS);
    return () => clearInterval(interval);
  }, [hasPlayer, trackPosition]);

  // Стабильная ссылка обязательна: потребители кладут этот объект в deps
  // своего useCallback. Новый литерал на каждый рендер пересоздавал бы их
  // обработчики без всякой причины.
  return useMemo(() => ({ trackPosition }), [trackPosition]);
}
