import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import {
  buildAcademyLeadPayload,
  sendAcademyLead,
  type AcademyLeadInput,
} from '../albato-lead';

function baseInput(overrides: Partial<AcademyLeadInput> = {}): AcademyLeadInput {
  return {
    userId: 'user-1',
    name: 'Иван Петров',
    phone: '+79161234567',
    email: 'ivan@example.com',
    yandexId: null,
    referralCode: null,
    marketplaces: ['WB', 'OZON'],
    experienceLevel: 'BEGINNER',
    goals: ['ADS', 'ANALYTICS'],
    goalText: 'Хочу поднять продажи',
    trialEndsAt: new Date('2026-07-02T10:00:00.000Z'),
    registeredAt: new Date('2026-06-29T09:12:00.000Z'),
    now: new Date('2026-06-29T09:25:00.000Z'),
    ...overrides,
  };
}

describe('buildAcademyLeadPayload', () => {
  it('maps enum codes to Russian labels', () => {
    const p = buildAcademyLeadPayload(baseInput());
    expect(p.marketplaces).toBe('Wildberries, Ozon');
    expect(p.experience).toBe('Новичок');
    expect(p.goals).toBe('Снизить расходы на рекламу, Разобраться в аналитике и нишах');
  });

  it('derives registration_source from yandexId', () => {
    expect(buildAcademyLeadPayload(baseInput({ yandexId: null })).registration_source).toBe('Email');
    expect(buildAcademyLeadPayload(baseInput({ yandexId: 'y-123' })).registration_source).toBe('Яндекс');
  });

  it('passes through contact fields and referral code', () => {
    const p = buildAcademyLeadPayload(baseInput({ referralCode: 'REF-AB12CD' }));
    expect(p).toMatchObject({
      user_id: 'user-1',
      name: 'Иван Петров',
      phone: '+79161234567',
      email: 'ivan@example.com',
      referral_code: 'REF-AB12CD',
      goal_text: 'Хочу поднять продажи',
    });
  });

  it('marks trial active only when trialEndsAt is in the future', () => {
    const future = buildAcademyLeadPayload(
      baseInput({ trialEndsAt: new Date('2026-07-02T10:00:00.000Z'), now: new Date('2026-06-29T09:25:00.000Z') }),
    );
    expect(future.trial_active).toBe(true);
    expect(future.trial_ends_at).toBe('2026-07-02T10:00:00.000Z');

    const past = buildAcademyLeadPayload(
      baseInput({ trialEndsAt: new Date('2026-06-01T10:00:00.000Z'), now: new Date('2026-06-29T09:25:00.000Z') }),
    );
    expect(past.trial_active).toBe(false);

    const none = buildAcademyLeadPayload(baseInput({ trialEndsAt: null }));
    expect(none.trial_active).toBe(false);
    expect(none.trial_ends_at).toBeNull();
  });

  it('emits empty strings for null contact/qualification fields', () => {
    const p = buildAcademyLeadPayload(
      baseInput({ name: null, phone: null, email: null, experienceLevel: null, goals: [], goalText: null, marketplaces: [] }),
    );
    expect(p.name).toBe('');
    expect(p.phone).toBe('');
    expect(p.email).toBe('');
    expect(p.experience).toBe('');
    expect(p.goals).toBe('');
    expect(p.goal_text).toBe('');
    expect(p.marketplaces).toBe('');
    expect(p.referral_code).toBe('');
  });

  it('serialises registered_at and timestamp as ISO 8601', () => {
    const p = buildAcademyLeadPayload(baseInput());
    expect(p.registered_at).toBe('2026-06-29T09:12:00.000Z');
    expect(p.timestamp).toBe('2026-06-29T09:25:00.000Z');
  });
});

describe('sendAcademyLead', () => {
  const realFetch = global.fetch;
  const realUrl = process.env.ALBATO_WEBHOOK_URL;

  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    global.fetch = realFetch;
    if (realUrl === undefined) delete process.env.ALBATO_WEBHOOK_URL;
    else process.env.ALBATO_WEBHOOK_URL = realUrl;
  });

  it('is a no-op when ALBATO_WEBHOOK_URL is unset (no fetch)', async () => {
    delete process.env.ALBATO_WEBHOOK_URL;
    const fetchMock = vi.fn();
    global.fetch = fetchMock as never;
    await sendAcademyLead(baseInput());
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('POSTs flat JSON with Content-Type header when configured', async () => {
    process.env.ALBATO_WEBHOOK_URL = 'https://h.albato.example/wh/test';
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    global.fetch = fetchMock as never;

    await sendAcademyLead(baseInput({ referralCode: 'REF-XYZ' }));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe('https://h.albato.example/wh/test');
    expect(opts.method).toBe('POST');
    expect(opts.headers['Content-Type']).toBe('application/json');
    const body = JSON.parse(opts.body);
    expect(body.email).toBe('ivan@example.com');
    expect(body.referral_code).toBe('REF-XYZ');
    expect(body.marketplaces).toBe('Wildberries, Ozon');
  });

  it('throws on non-ok response so caller can log it', async () => {
    process.env.ALBATO_WEBHOOK_URL = 'https://h.albato.example/wh/test';
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 }) as never;
    await expect(sendAcademyLead(baseInput())).rejects.toThrow(/500/);
  });
});
