import { describe, it, expect } from 'vitest';
import { assembleClientRegistry, toRegistryCsv, type RegistryInput } from '../client-registry';

function input(overrides: Partial<RegistryInput> = {}): RegistryInput {
  return {
    users: [
      { id: 'u1', email: 'a@x.ru', name: 'Анна', phone: '+79161112233', createdAt: new Date('2026-06-20T08:00:00Z') },
      { id: 'u2', email: 'b@x.ru', name: 'Борис', phone: null, createdAt: new Date('2026-06-21T08:00:00Z') },
      { id: 'u3', email: 'c@x.ru', name: 'Вика', phone: '+79031114455', createdAt: new Date('2026-06-22T08:00:00Z') },
      { id: 'u4', email: 'd@x.ru', name: 'Глеб', phone: null, createdAt: new Date('2026-06-23T08:00:00Z') },
    ],
    sources: [
      { referredUserId: 'u1', type: 'ambassador', label: 'Блогер А' },
      { referredUserId: 'u2', type: 'referral', label: 'Иван' },
    ],
    payments: [
      // u1 paid twice → latest wins, status paid
      { userId: 'u1', status: 'COMPLETED', amount: 1990, paidAt: new Date('2026-06-24T10:00:00Z'), planName: 'Подписка на курс' },
      { userId: 'u1', status: 'COMPLETED', amount: 2990, paidAt: new Date('2026-06-26T10:00:00Z'), planName: 'Полный доступ' },
      // u2 failed only
      { userId: 'u2', status: 'FAILED', amount: 1990, paidAt: null, planName: 'Подписка на курс' },
      // u3 pending only → checkout
      { userId: 'u3', status: 'PENDING', amount: 1990, paidAt: null, planName: null },
    ],
    checkoutUserIds: ['u4'], // reached widget, no payment row
    trials: [
      { userId: 'u1', trialEndsAt: new Date('2026-06-23T08:00:00Z') },
      { userId: 'u3', trialEndsAt: new Date('2026-06-25T08:00:00Z') },
    ],
    ...overrides,
  };
}

describe('assembleClientRegistry', () => {
  it('derives payment status with paid > failed > checkout > none precedence', () => {
    const rows = assembleClientRegistry(input());
    const by = Object.fromEntries(rows.map((r) => [r.userId, r]));
    expect(by.u1.paymentStatus).toBe('paid');
    expect(by.u2.paymentStatus).toBe('failed');
    expect(by.u3.paymentStatus).toBe('checkout'); // PENDING payment
    expect(by.u4.paymentStatus).toBe('checkout'); // CheckoutAttempt only
  });

  it('reports the latest successful payment date/amount/plan', () => {
    const by = Object.fromEntries(assembleClientRegistry(input()).map((r) => [r.userId, r]));
    expect(by.u1.lastPaidAt).toBe('2026-06-26T10:00:00.000Z');
    expect(by.u1.lastPaidAmount).toBe(2990);
    expect(by.u1.plan).toBe('Полный доступ');
    expect(by.u2.lastPaidAt).toBeNull();
    expect(by.u2.lastPaidAmount).toBeNull();
  });

  it('reports trial end date per user (null when no trial)', () => {
    const by = Object.fromEntries(assembleClientRegistry(input()).map((r) => [r.userId, r]));
    expect(by.u1.trialEndsAt).toBe('2026-06-23T08:00:00.000Z');
    expect(by.u3.trialEndsAt).toBe('2026-06-25T08:00:00.000Z');
    expect(by.u2.trialEndsAt).toBeNull();
    expect(by.u4.trialEndsAt).toBeNull();
  });

  it('labels acquisition source (ambassador / referral / organic)', () => {
    const by = Object.fromEntries(assembleClientRegistry(input()).map((r) => [r.userId, r]));
    expect(by.u1.source).toBe('Амбассадор: Блогер А');
    expect(by.u2.source).toBe('Реферал: Иван');
    expect(by.u3.source).toBe('Органика');
  });

  it('marks a user with no payments and no checkout as none', () => {
    const rows = assembleClientRegistry(input({ checkoutUserIds: [], payments: [] }));
    expect(rows.every((r) => r.paymentStatus === 'none')).toBe(true);
  });
});

describe('toRegistryCsv', () => {
  it('emits a BOM + header and one row per client with RU labels', () => {
    const csv = toRegistryCsv(assembleClientRegistry(input()));
    expect(csv.startsWith('﻿')).toBe(true);
    const lines = csv.replace('﻿', '').split('\r\n');
    expect(lines[0]).toBe('Email,Имя,Телефон,Дата регистрации,Триал до,Источник,Статус оплаты,Дата оплаты,Сумма,Тариф');
    expect(lines).toHaveLength(5); // header + 4 users
    expect(lines[1]).toContain('a@x.ru');
    expect(lines[1]).toContain('Оплатил');
  });

  it('escapes cells containing commas or quotes (RFC 4180)', () => {
    const rows = assembleClientRegistry(
      input({ sources: [{ referredUserId: 'u1', type: 'ambassador', label: 'Блогер, "Про"' }] }),
    );
    const csv = toRegistryCsv(rows);
    expect(csv).toContain('"Амбассадор: Блогер, ""Про"""');
  });
});
