import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PrismaClient } from '@mpstats/db';
import { LEGAL_VERSIONS } from '@mpstats/shared';

// Sentry is soft-imported inside consent.ts via require('@sentry/nextjs').
// Mock the module so we can assert captureException was called without
// requiring the real @sentry/nextjs package to be installed in this workspace.
const captureException = vi.fn();
vi.mock('@sentry/nextjs', () => ({
  captureException,
}));

import { recordConsents } from './consent';

function makePrisma(createManyImpl: (...args: any[]) => any): PrismaClient {
  return {
    userConsent: {
      createMany: vi.fn(createManyImpl),
    },
  } as unknown as PrismaClient;
}

describe('recordConsents', () => {
  beforeEach(() => {
    captureException.mockClear();
  });

  it('is best-effort: swallows errors and reports to Sentry, never rethrows', async () => {
    const prisma = makePrisma(() => Promise.reject(new Error('db down')));

    await expect(
      recordConsents(prisma, 'user-1', ['OFFER'], 'REGISTER'),
    ).resolves.toBeUndefined();

    expect(captureException).toHaveBeenCalledTimes(1);
    const [err, ctx] = captureException.mock.calls[0];
    expect(err).toBeInstanceOf(Error);
    expect(ctx).toMatchObject({ tags: { area: 'consent', source: 'REGISTER' } });
  });

  it('writes one row per kind via a single createMany call with correct fields', async () => {
    const prisma = makePrisma(() => Promise.resolve({ count: 2 }));

    await recordConsents(prisma, 'user-2', ['OFFER', 'PDN'], 'CHECKOUT', {
      ip: '1.2.3.4',
      userAgent: 'UA/1.0',
    });

    expect(prisma.userConsent.createMany).toHaveBeenCalledTimes(1);
    const [{ data }] = (prisma.userConsent.createMany as any).mock.calls[0];
    expect(data).toEqual([
      {
        userId: 'user-2',
        kind: 'OFFER',
        source: 'CHECKOUT',
        version: LEGAL_VERSIONS.OFFER,
        ip: '1.2.3.4',
        userAgent: 'UA/1.0',
      },
      {
        userId: 'user-2',
        kind: 'PDN',
        source: 'CHECKOUT',
        version: LEGAL_VERSIONS.PDN,
        ip: '1.2.3.4',
        userAgent: 'UA/1.0',
      },
    ]);
    expect(captureException).not.toHaveBeenCalled();
  });

  it('defaults ip/userAgent to null and allows a custom version resolver', async () => {
    const prisma = makePrisma(() => Promise.resolve({ count: 1 }));

    await recordConsents(prisma, 'user-3', ['ADV'], 'ONBOARDING', {
      version: () => 'custom-v1',
    });

    const [{ data }] = (prisma.userConsent.createMany as any).mock.calls[0];
    expect(data).toEqual([
      {
        userId: 'user-3',
        kind: 'ADV',
        source: 'ONBOARDING',
        version: 'custom-v1',
        ip: null,
        userAgent: null,
      },
    ]);
  });
});
