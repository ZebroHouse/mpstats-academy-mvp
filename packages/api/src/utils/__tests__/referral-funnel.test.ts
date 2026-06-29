import { describe, it, expect } from 'vitest';
import { assembleReferralFunnel, type FunnelInput } from '../referral-funnel';

const codes = [
  { id: 'c1', code: 'AMB-AAA', label: 'Блогер А', landingTarget: 'HOME' },
  { id: 'c2', code: 'AMB-BBB', label: 'Блогер Б', landingTarget: 'REGISTER' },
];

function input(overrides: Partial<FunnelInput> = {}): FunnelInput {
  return {
    codes,
    clicksByCode: [
      { codeId: 'c1', clicks: 100 },
      { codeId: 'c2', clicks: 40 },
    ],
    clicksByDay: [
      { day: '2026-06-28', clicks: 60 },
      { day: '2026-06-29', clicks: 80 },
    ],
    referrals: [
      { codeId: 'c1', referredUserId: 'u1', createdAt: new Date('2026-06-28T10:00:00Z'), isTest: false, onboarded: true },
      { codeId: 'c1', referredUserId: 'u2', createdAt: new Date('2026-06-29T10:00:00Z'), isTest: false, onboarded: false },
      { codeId: 'c2', referredUserId: 'u3', createdAt: new Date('2026-06-29T11:00:00Z'), isTest: false, onboarded: true },
      // test user — excluded everywhere
      { codeId: 'c1', referredUserId: 'u4', createdAt: new Date('2026-06-29T12:00:00Z'), isTest: true, onboarded: true },
    ],
    payments: [
      { userId: 'u1', paidAt: new Date('2026-06-29T13:00:00Z') },
      { userId: 'u1', paidAt: new Date('2026-06-30T09:00:00Z') }, // same user, 2nd payment → still 1 sale
      { userId: 'u3', paidAt: new Date('2026-06-30T10:00:00Z') },
      { userId: 'uX', paidAt: new Date('2026-06-30T10:00:00Z') }, // not referred → ignored
    ],
    ...overrides,
  };
}

describe('assembleReferralFunnel', () => {
  it('computes per-code clicks / registrations / onboarded / sales', () => {
    const r = assembleReferralFunnel(input());
    const c1 = r.perCode.find((x) => x.codeId === 'c1')!;
    const c2 = r.perCode.find((x) => x.codeId === 'c2')!;

    expect(c1.clicks).toBe(100);
    expect(c1.registrations).toBe(2); // u1, u2 (u4 is test → excluded)
    expect(c1.onboarded).toBe(1); // u1
    expect(c1.sales).toBe(1); // u1 distinct (two payments collapse)

    expect(c2.clicks).toBe(40);
    expect(c2.registrations).toBe(1); // u3
    expect(c2.sales).toBe(1); // u3
  });

  it('excludes test-user referrals from registrations and sales', () => {
    const r = assembleReferralFunnel(input());
    const c1 = r.perCode.find((x) => x.codeId === 'c1')!;
    // u4 is a test referral on c1 — must not be counted.
    expect(c1.registrations).toBe(2);
  });

  it('computes conversion ratios, null on zero denominator', () => {
    const r = assembleReferralFunnel(input());
    const c1 = r.perCode.find((x) => x.codeId === 'c1')!;
    expect(c1.regPerClick).toBe(2); // 2/100 = 2.0%
    expect(c1.salePerReg).toBe(50); // 1/2 = 50.0%

    const zero = assembleReferralFunnel(
      input({ clicksByCode: [{ codeId: 'c1', clicks: 0 }], referrals: [], payments: [] }),
    );
    const z1 = zero.perCode.find((x) => x.codeId === 'c1')!;
    expect(z1.regPerClick).toBeNull();
    expect(z1.salePerReg).toBeNull();
  });

  it('builds a per-day series (clicks + registrations + sales) sorted ascending', () => {
    const r = assembleReferralFunnel(input());
    expect(r.series.map((d) => d.day)).toEqual(['2026-06-28', '2026-06-29', '2026-06-30']);

    const d28 = r.series.find((d) => d.day === '2026-06-28')!;
    expect(d28.clicks).toBe(60);
    expect(d28.registrations).toBe(1); // u1

    const d29 = r.series.find((d) => d.day === '2026-06-29')!;
    expect(d29.clicks).toBe(80);
    expect(d29.registrations).toBe(2); // u2, u3 (u4 test excluded)
    expect(d29.sales).toBe(1); // u1 payment

    const d30 = r.series.find((d) => d.day === '2026-06-30')!;
    expect(d30.sales).toBe(2); // u1 + u3 payments (uX not referred → excluded)
  });

  it('aggregates correct totals', () => {
    const r = assembleReferralFunnel(input());
    expect(r.totals).toEqual({ clicks: 140, registrations: 3, onboarded: 2, sales: 2 });
  });

  it('keeps codes with zero activity (sorted last)', () => {
    const r = assembleReferralFunnel(
      input({ clicksByCode: [{ codeId: 'c1', clicks: 5 }], referrals: [], payments: [], clicksByDay: [] }),
    );
    expect(r.perCode).toHaveLength(2);
    expect(r.perCode[r.perCode.length - 1].codeId).toBe('c2'); // empty → last
  });
});
