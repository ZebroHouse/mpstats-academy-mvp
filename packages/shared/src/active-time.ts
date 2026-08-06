/**
 * Активное время просмотра: секунда засчитывается, только если позиция плеера
 * сдвинулась вперёд. Пауза, свёрнутая вкладка и перемотка назад времени не
 * набирают.
 *
 * Прибавляем настенное время, а не сдвиг позиции: на скорости 2x позиция растёт
 * вдвое быстрее часов, но человек потратил именно столько минут, сколько прошло.
 */

/** Потолок прибавки за один тик. Гасит перемотку вперёд и замороженный в фоне таймер. */
export const MAX_TICK_SECONDS = 2;

/** Ниже этого сдвига считаем, что плеер стоит (дрожание опроса getCurrentTime). */
const MIN_POSITION_DELTA = 0.1;

export function accumulateActiveSeconds(params: {
  prevPosition: number;
  nextPosition: number;
  elapsedMs: number;
  prevActiveSeconds: number;
}): number {
  const { prevPosition, nextPosition, elapsedMs, prevActiveSeconds } = params;
  if (elapsedMs <= 0) return prevActiveSeconds;
  if (nextPosition - prevPosition < MIN_POSITION_DELTA) return prevActiveSeconds;
  return prevActiveSeconds + Math.min(elapsedMs / 1000, MAX_TICK_SECONDS);
}
