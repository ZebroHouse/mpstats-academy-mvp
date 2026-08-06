'use client';

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { accumulateActiveSeconds } from '@mpstats/shared';
import superjson from 'superjson';
import { trpc } from '@/lib/trpc/client';

/** Реже, чем saveWatchProgress (15с): журналу не нужна свежесть, нужна полнота. */
const PING_INTERVAL_MS = 60_000;
/** Такт собственного тикера для уроков без плеера. */
const SELF_TICK_MS = 1_000;
/** Ниже секунды писать нечего — это открыл и сразу закрыл. */
const MIN_REPORTABLE_SECONDS = 1;

/**
 * Путь pingView в формате, который строит httpBatchLink (см. provider.tsx —
 * обе ветки splitLink батчат, простого httpLink в приложении нет): ?batch=1
 * в URL и тело {"0": superjson.serialize(input)}. Без ?batch=1
 * fetchRequestHandler разберёт тело как одиночный вызов и ждёт другой
 * конверт — ручной beacon-запрос обязан повторить именно батч-форму, иначе
 * сервер получит и молча отбросит не то, что ожидает клиент.
 */
const PING_VIEW_BEACON_URL = '/api/trpc/contentView.pingView?batch=1';

type PingPayload = { viewId: string; activeSeconds: number; percent: number; completed: boolean };

function buildBeaconBody(payload: PingPayload): string {
  return JSON.stringify({ 0: superjson.serialize(payload) });
}

/**
 * Отправляет пинг транспортом, который переживает реальную выгрузку страницы:
 * сперва sendBeacon, при его отсутствии/неудаче — fetch с keepalive (оба не
 * блокируют unload и не рвутся браузером на середине). Возвращает false,
 * только если ни один из них недоступен вовсе — тогда вызывающий код сам
 * решает, откатываться ли на обычную мутацию.
 *
 * Обычный fetch (то, что делает pingRef.current.mutate) здесь не годится:
 * браузер обрывает такой запрос в момент фактической выгрузки страницы —
 * самый частый случай, короткий заход короче PING_INTERVAL_MS, закрытый
 * закрытием вкладки, вообще не долетел бы до сервера.
 */
function sendExitPing(payload: PingPayload): boolean {
  const body = buildBeaconBody(payload);

  if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
    try {
      if (navigator.sendBeacon(PING_VIEW_BEACON_URL, new Blob([body], { type: 'application/json' }))) {
        return true;
      }
    } catch {
      /* sendBeacon недоступен по факту — падаем на fetch keepalive ниже */
    }
  }

  if (typeof fetch === 'function') {
    try {
      fetch(PING_VIEW_BEACON_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
        keepalive: true,
        credentials: 'same-origin',
      }).catch(() => { /* best effort — страница всё равно уходит */ });
      return true;
    } catch {
      /* синхронный throw из fetch — окружение действительно не даёт beacon-транспорт */
    }
  }

  return false;
}

/**
 * Журнал заходов в урок. Полностью побочный: если startView не сработал
 * (флаг выключен, урок не найден, БД недоступна), viewId остаётся null и хук
 * молча ничего не делает — страница урока об этом не знает.
 *
 * Пинг шлёт НАКОПЛЕННОЕ с начала просмотра, а не дельту: потерянный пинг
 * тогда не теряет данные, следующий их догоняет.
 *
 * `selfTick` — не «есть ли плеер», а «должен ли хук сам вести часы».
 * Хук ведёт часы САМ только тогда, когда потребитель говорит: на экране
 * реально показывается контент, позицию которого больше некому докладывать
 * (текстовый/интерактивный урок). Во всех остальных случаях — идёт загрузка,
 * урок за паywall'ом, видео ещё не залито — на экране либо ничего, либо
 * плеер, который сам зовёт trackPosition; тикать самостоятельно значит
 * приписывать секунды просмотра тому, чего пользователь не видел.
 */
export function useContentView(lessonId: string, options: { selfTick?: boolean } = {}) {
  const selfTick = options.selfTick ?? false;

  const viewIdRef = useRef<string | null>(null);
  const activeSecondsRef = useRef(0);
  const percentRef = useRef(0);
  const prevPositionRef = useRef(0);
  const prevTickAtRef = useRef<number | null>(null);
  // Снимок накопленного на момент ухода с урока (см. эффект ниже) — на
  // случай, если startView ещё не успел ответить к этому моменту.
  const exitSnapshotRef = useRef({ activeSeconds: 0, percent: 0 });

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
      .then((r) => {
        if (cancelled) {
          // Ушли с этого урока (сменили lessonId или размонтировались) до
          // того, как startView успел ответить. viewIdRef/activeSecondsRef
          // к этому моменту уже могут принадлежать следующему уроку —
          // трогать их нельзя. Но строка на сервере уже создана, и то время,
          // что успели накопить до ухода (снято в cleanup этого же эффекта),
          // никуда не делось — досылаем его отдельным пингом под свежий
          // viewId. Без этого сервер получает фантомный нулевой визит на
          // каждый уход, случившийся быстрее ответа startView.
          const snap = exitSnapshotRef.current;
          if (r.viewId && snap.activeSeconds >= MIN_REPORTABLE_SECONDS) {
            pingRef.current.mutate({
              viewId: r.viewId,
              activeSeconds: Math.round(snap.activeSeconds),
              percent: Math.round(snap.percent),
              completed: snap.percent >= 90,
            });
          }
          return;
        }
        viewIdRef.current = r.viewId;
      })
      .catch(() => { /* журнал не мешает уроку */ });

    return () => {
      cancelled = true;
      exitSnapshotRef.current = { activeSeconds: activeSecondsRef.current, percent: percentRef.current };
    };
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

  // Досылка на реальный уход со страницы (pagehide / скрытие вкладки) —
  // тот же итог, что и flush(), но транспортом из sendExitPing, который
  // переживает выгрузку. Обычный flush() тут же и остаётся откатом, если
  // ни sendBeacon, ни fetch keepalive не доступны.
  const flushOnExit = useCallback(() => {
    const viewId = viewIdRef.current;
    if (!viewId) return;
    if (activeSecondsRef.current < MIN_REPORTABLE_SECONDS) return;
    const payload: PingPayload = {
      viewId,
      activeSeconds: Math.round(activeSecondsRef.current),
      percent: Math.round(percentRef.current),
      completed: percentRef.current >= 90,
    };
    if (!sendExitPing(payload)) {
      pingRef.current.mutate(payload);
    }
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
  // beforeunload на iOS Safari, поэтому слушаем оба. Эффект также ключится
  // на lessonId: React гарантирует, что все cleanup-функции отрабатывают
  // раньше новых эффектов, поэтому cleanup здесь видит ещё старые (лесона A)
  // viewId и activeSeconds — без lessonId в deps этот эффект пересоздаётся
  // только при размонтировании, и переход на следующий урок вообще не
  // флашил бы предыдущий (эффект сброса на [lessonId] обнулял бы refs
  // раньше, чем это тело успело бы что-то отправить).
  useEffect(() => {
    const interval = setInterval(flush, PING_INTERVAL_MS);
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        flushOnExit();
        // Тик после долгого «в фоне» иначе увидит огромный elapsedMs и на
        // возврате добавит MAX_TICK_SECONDS вместо честной одной секунды —
        // сбрасываем точку отсчёта, а не гасим накопление совсем.
        prevTickAtRef.current = null;
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', flushOnExit);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', flushOnExit);
      flush();
    };
  }, [flush, flushOnExit, lessonId]);

  // Уроки без плеера: тикаем сами, пока вкладка видима. Синтетическая позиция
  // растёт на секунду за такт, поэтому накопитель из shared работает как есть.
  useEffect(() => {
    if (!selfTick) return;
    // selfTick может смениться после монтирования (пока урок ещё грузится
    // или пока не ясно, что показывать, потребитель передаёт false; когда
    // на экране появляется реальный текстовый/интерактивный контент — true).
    // Без сброса prevPositionRef/prevTickAtRef синтетическая позиция тикера
    // просочилась бы в пространство позиций реального плеера — тот начинает
    // отсчёт с 0, а accumulateActiveSeconds молча не считает ничего, пока
    // позиция плеера не догонит оставленное тикером значение.
    prevPositionRef.current = 0;
    prevTickAtRef.current = null;
    const interval = setInterval(() => {
      if (document.visibilityState !== 'visible') {
        // Вкладка скрылась посреди такта — не тикаем, но и не копим elapsedMs
        // через паузу: следующий видимый тик начнёт счёт заново, а не
        // получит фантомный MAX_TICK_SECONDS на скачке времени.
        prevTickAtRef.current = null;
        return;
      }
      trackPosition(prevPositionRef.current + 1, 0);
    }, SELF_TICK_MS);
    return () => {
      clearInterval(interval);
      prevPositionRef.current = 0;
      prevTickAtRef.current = null;
    };
  }, [selfTick, trackPosition]);

  // Стабильная ссылка обязательна: потребители кладут этот объект в deps
  // своего useCallback. Новый литерал на каждый рендер пересоздавал бы их
  // обработчики без всякой причины.
  return useMemo(() => ({ trackPosition }), [trackPosition]);
}
