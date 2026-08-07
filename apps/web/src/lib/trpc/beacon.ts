'use client';

import superjson from 'superjson';

/**
 * Отправка tRPC-мутации транспортом, который переживает выгрузку страницы.
 *
 * Зачем отдельный модуль, а не «просто позвать мутацию»: обычный fetch
 * (то, что делает `mutation.mutate`) браузер обрывает в момент фактического
 * закрытия вкладки. Для коротких заходов это означает, что финальные данные
 * не долетают вообще — а именно финальные данные тут и нужны.
 *
 * Зачем один общий модуль, а не по копии на каждом вызове: формат запроса
 * неочевиден, и написанная на глаз копия молча не работает. Такая копия уже
 * жила в проде (`saveWatchProgress` в странице урока) — сериализовала тело
 * дважды и теряла `?batch=1`, поэтому сервер разбирал строку там, где схема
 * ждала объект, и запрос тихо отбрасывался. Ошибки при этом не видно: beacon
 * по своей природе не сообщает о результате.
 *
 * Формат подсмотрен не на глаз, а прослежен по исходникам `@trpc/client`:
 * `httpBatchLink` кладёт `?batch=1` в URL и `{"0": <serialized>}` в тело,
 * где сериализация — это трансформер клиента (у нас superjson, см.
 * `provider.tsx`; обе ветки `splitLink` батчат, простого `httpLink` в
 * приложении нет). Без `?batch=1` серверный обработчик читает тело как
 * одиночный вызов и ждёт другой конверт.
 */

/** База роутера tRPC — совпадает с `apps/web/src/app/api/trpc/[trpc]/route.ts`. */
const TRPC_ENDPOINT = '/api/trpc';

function beaconUrl(procedurePath: string): string {
  return `${TRPC_ENDPOINT}/${procedurePath}?batch=1`;
}

function beaconBody(input: unknown): string {
  return JSON.stringify({ 0: superjson.serialize(input) });
}

/**
 * Шлёт мутацию «на выходе»: сперва `sendBeacon`, при его недоступности или
 * отказе — `fetch` с `keepalive`. Оба не блокируют выгрузку и не рвутся на
 * середине.
 *
 * @param procedurePath путь процедуры, например `learning.saveWatchProgress`
 * @returns `false`, только если ни один транспорт недоступен — тогда
 *          вызывающий код сам решает, откатываться ли на обычную мутацию.
 *          Успешный возврат означает «запрос отправлен», а не «сервер принял»:
 *          beacon доставку не подтверждает, и полагаться на это нельзя.
 */
export function sendTrpcBeacon(procedurePath: string, input: unknown): boolean {
  const url = beaconUrl(procedurePath);
  const body = beaconBody(input);

  if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
    try {
      if (navigator.sendBeacon(url, new Blob([body], { type: 'application/json' }))) {
        return true;
      }
    } catch {
      /* sendBeacon недоступен по факту — падаем на fetch keepalive ниже */
    }
  }

  if (typeof fetch === 'function') {
    try {
      fetch(url, {
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
