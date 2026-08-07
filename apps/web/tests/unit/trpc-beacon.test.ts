import { describe, it, expect, vi, afterEach } from 'vitest';
import superjson from 'superjson';
import { sendTrpcBeacon } from '@/lib/trpc/beacon';

/**
 * Эти тесты пиннят формат запроса, а не поведение браузера.
 *
 * Формат тут — не деталь реализации: написанная на глаз копия жила в проде и
 * молча не работала (тело сериализовалось дважды, `?batch=1` терялся), а
 * beacon по своей природе не сообщает об ошибке — сервер просто отбрасывал
 * запрос. Поэтому проверяем ровно то, что нельзя увидеть в рантайме.
 */

const INPUT = { lessonId: 'L1', position: 42, duration: 600 };

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function blobText(body: unknown): Promise<string> {
  return body instanceof Blob ? await body.text() : String(body);
}

describe('sendTrpcBeacon', () => {
  it('шлёт на путь процедуры с ?batch=1', async () => {
    const sendBeacon = vi.fn().mockReturnValue(true);
    vi.stubGlobal('navigator', { sendBeacon });

    expect(sendTrpcBeacon('learning.saveWatchProgress', INPUT)).toBe(true);
    expect(sendBeacon).toHaveBeenCalledTimes(1);
    expect(sendBeacon.mock.calls[0][0]).toBe('/api/trpc/learning.saveWatchProgress?batch=1');
  });

  it('тело — конверт {"0": superjson.serialize(input)}, сериализованный один раз', async () => {
    const sendBeacon = vi.fn().mockReturnValue(true);
    vi.stubGlobal('navigator', { sendBeacon });

    sendTrpcBeacon('learning.saveWatchProgress', INPUT);
    const raw = await blobText(sendBeacon.mock.calls[0][1]);
    const parsed = JSON.parse(raw);

    // Ключ "0" — индекс вызова в батче.
    expect(Object.keys(parsed)).toEqual(['0']);
    // Двойной сериализации быть не должно: под ключом объект, а не строка.
    expect(typeof parsed['0']).toBe('object');
    expect(parsed['0']).toEqual(superjson.serialize(INPUT));
    // И на всякий случай — вход восстанавливается обратно.
    expect(superjson.deserialize(parsed['0'])).toEqual(INPUT);
  });

  it('тип содержимого — application/json, иначе сервер не подхватит обработчик', async () => {
    const sendBeacon = vi.fn().mockReturnValue(true);
    vi.stubGlobal('navigator', { sendBeacon });

    sendTrpcBeacon('contentView.pingView', INPUT);
    const body = sendBeacon.mock.calls[0][1] as Blob;
    expect(body.type).toBe('application/json');
  });

  it('sendBeacon отказал → падаем на fetch с keepalive, тем же телом и URL', async () => {
    const sendBeacon = vi.fn().mockReturnValue(false);
    const fetchMock = vi.fn().mockResolvedValue(new Response(null));
    vi.stubGlobal('navigator', { sendBeacon });
    vi.stubGlobal('fetch', fetchMock);

    expect(sendTrpcBeacon('contentView.pingView', INPUT)).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/trpc/contentView.pingView?batch=1');
    expect(init.method).toBe('POST');
    expect(init.keepalive).toBe(true);
    expect(init.credentials).toBe('same-origin');
    expect(JSON.parse(init.body)).toEqual({ 0: superjson.serialize(INPUT) });
  });

  it('sendBeacon бросил исключение → тоже падаем на fetch', async () => {
    const sendBeacon = vi.fn().mockImplementation(() => { throw new Error('nope'); });
    const fetchMock = vi.fn().mockResolvedValue(new Response(null));
    vi.stubGlobal('navigator', { sendBeacon });
    vi.stubGlobal('fetch', fetchMock);

    expect(sendTrpcBeacon('contentView.pingView', INPUT)).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('отвалившийся fetch не пробрасывает ошибку наружу', async () => {
    const sendBeacon = vi.fn().mockReturnValue(false);
    const fetchMock = vi.fn().mockRejectedValue(new Error('offline'));
    vi.stubGlobal('navigator', { sendBeacon });
    vi.stubGlobal('fetch', fetchMock);

    expect(() => sendTrpcBeacon('contentView.pingView', INPUT)).not.toThrow();
    await Promise.resolve();
  });

  it('транспорта нет вовсе → false, чтобы вызывающий откатился на обычную мутацию', () => {
    vi.stubGlobal('navigator', {});
    vi.stubGlobal('fetch', undefined);

    expect(sendTrpcBeacon('contentView.pingView', INPUT)).toBe(false);
  });
});
