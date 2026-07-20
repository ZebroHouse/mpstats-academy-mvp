import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchByTime, fetchTotals, metrikaCredentials } from '../client';

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response;
}

describe('fetchTotals / fetchByTime — ретраи', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('успех с первой попытки — fetch вызван 1 раз', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ totals: [1] }));
    vi.stubGlobal('fetch', fetchMock);

    const promise = fetchTotals(new URLSearchParams({ ids: '1' }), 'tok');
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ totals: [1] });
  });

  it('429, затем успех — оба вызова учтены, результат успешный', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({}, 429))
      .mockResolvedValueOnce(jsonResponse({ totals: [2] }));
    vi.stubGlobal('fetch', fetchMock);

    const promise = fetchTotals(new URLSearchParams(), 'tok');
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ totals: [2] });
  });

  it('400 не ретраится — fetch вызван ровно 1 раз, наружу летит MetrikaError со status 400', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ message: 'bad token' }, 400));
    vi.stubGlobal('fetch', fetchMock);

    const promise = fetchTotals(new URLSearchParams(), 'tok');
    // Атач .rejects ДО продвижения таймеров — иначе промис успевает
    // отклониться раньше, чем к нему подцепится обработчик, и Node
    // репортит unhandledRejection несмотря на итоговый await.
    const assertion = expect(promise).rejects.toMatchObject({ name: 'MetrikaError', status: 400 });
    await vi.runAllTimersAsync();
    await assertion;
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('три подряд 500 — наружу летит ошибка, fetch вызван ATTEMPTS (3) раз', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}, 500));
    vi.stubGlobal('fetch', fetchMock);

    const promise = fetchTotals(new URLSearchParams(), 'tok');
    const assertion = expect(promise).rejects.toMatchObject({ name: 'MetrikaError', status: 500 });
    await vi.runAllTimersAsync();
    await assertion;
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('уходит заголовок Authorization: OAuth <token>, не query-параметр', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ time_intervals: [] }));
    vi.stubGlobal('fetch', fetchMock);

    const promise = fetchByTime(new URLSearchParams(), 'my-secret-token');
    await vi.runAllTimersAsync();
    await promise;

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBe('OAuth my-secret-token');
  });
});

describe('metrikaCredentials', () => {
  const ORIGINAL_ENV = { ...process.env };

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it('возвращает null, если counterId не задан', () => {
    delete process.env.YANDEX_METRIKA_COUNTER_ID;
    process.env.YANDEX_METRIKA_OAUTH_TOKEN = 'tok';
    expect(metrikaCredentials()).toBeNull();
  });

  it('возвращает null, если token не задан', () => {
    process.env.YANDEX_METRIKA_COUNTER_ID = '123';
    delete process.env.YANDEX_METRIKA_OAUTH_TOKEN;
    expect(metrikaCredentials()).toBeNull();
  });

  it('возвращает объект, если обе переменные заданы', () => {
    process.env.YANDEX_METRIKA_COUNTER_ID = '123';
    process.env.YANDEX_METRIKA_OAUTH_TOKEN = 'tok';
    expect(metrikaCredentials()).toEqual({ counterId: '123', token: 'tok' });
  });
});
