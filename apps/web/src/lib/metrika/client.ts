import 'server-only';

const BY_TIME_URL = 'https://api-metrika.yandex.net/stat/v1/data/bytime';
const TOTALS_URL = 'https://api-metrika.yandex.net/stat/v1/data';
const TIMEOUT_MS = 20_000;
const ATTEMPTS = 3;

export class MetrikaError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = 'MetrikaError';
  }
}

export interface MetrikaCredentials {
  counterId: string;
  token: string;
}

/** null, если env не проставлены — вызывающий решает, это ошибка или no-op. */
export function metrikaCredentials(): MetrikaCredentials | null {
  const counterId = process.env.YANDEX_METRIKA_COUNTER_ID;
  const token = process.env.YANDEX_METRIKA_OAUTH_TOKEN;
  if (!counterId || !token) return null;
  return { counterId, token };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function requestJson(url: string, params: URLSearchParams, token: string): Promise<unknown> {
  let lastError: unknown;

  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const res = await fetch(`${url}?${params.toString()}`, {
        headers: { Authorization: `OAuth ${token}` },
        signal: controller.signal,
        cache: 'no-store',
      });

      // 429 — лимит 200 запросов / 5 минут, 5xx — временная беда на их стороне.
      // Оба лечатся ожиданием, остальные 4xx — нет (протухший токен, кривой запрос).
      if (res.status === 429 || res.status >= 500) {
        lastError = new MetrikaError(`Метрика ответила ${res.status}`, res.status);
        await sleep(1000 * (attempt + 1));
        continue;
      }

      if (!res.ok) {
        const body = await res.text();
        throw new MetrikaError(`Метрика ответила ${res.status}: ${body.slice(0, 200)}`, res.status);
      }

      return await res.json();
    } catch (error) {
      if (error instanceof MetrikaError && error.status && error.status < 500 && error.status !== 429) {
        throw error;
      }
      lastError = error;
      await sleep(250 * (attempt + 1));
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new MetrikaError('Метрика недоступна после ретраев');
}

export function fetchByTime(params: URLSearchParams, token: string): Promise<unknown> {
  return requestJson(BY_TIME_URL, params, token);
}

export function fetchTotals(params: URLSearchParams, token: string): Promise<unknown> {
  return requestJson(TOTALS_URL, params, token);
}
