// apps/web/src/lib/carrotquest/__tests__/partner-emails.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock CQ client
vi.mock('../client', () => ({
  cq: {
    setUserProps: vi.fn().mockResolvedValue(undefined),
    trackEvent: vi.fn().mockResolvedValue(undefined),
  },
}));

// isEmailEnabled is implemented locally in emails.ts via prisma.featureFlag.findUnique.
// Mock prisma so the feature flag returns enabled=true.
vi.mock('@mpstats/db/client', () => ({
  prisma: {
    featureFlag: {
      findUnique: vi.fn().mockResolvedValue({ enabled: true }),
    },
  },
}));

// Suppress Sentry side-effects
vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
}));

import { cq } from '../client';
import { firePartnerEntryLead, sendPartnerConfirmEmail } from '../emails';

describe('partner CQ helpers', () => {
  beforeEach(() => vi.clearAllMocks());

  it('firePartnerEntryLead sets source props and tracks pa_partner_entry', async () => {
    await firePartnerEntryLead('u1', {
      email: 'a@b.com',
      name: 'Иван',
      phone: '+7999',
      moduleCode: 'seo',
    });
    expect(cq.setUserProps).toHaveBeenCalledWith(
      'u1',
      expect.objectContaining({
        '$email': 'a@b.com',
        pa_partner_source: 'mpstats',
        pa_partner_module: 'seo',
      }),
    );
    expect(cq.trackEvent).toHaveBeenCalledWith('u1', 'pa_partner_entry');
  });

  it('sendPartnerConfirmEmail fires dedicated pa_partner_magic_link event with the confirm link', async () => {
    await sendPartnerConfirmEmail('u2', {
      email: 'a@b.com',
      name: 'Иван',
      confirmUrl: 'https://x/auth/confirm?token_hash=abc',
    });
    expect(cq.setUserProps).toHaveBeenCalledWith(
      'u2',
      expect.objectContaining({
        '$email': 'a@b.com',
        pa_partner_magic_link: 'https://x/auth/confirm?token_hash=abc',
      }),
    );
    expect(cq.trackEvent).toHaveBeenCalledWith('u2', 'pa_partner_magic_link');
  });
});
