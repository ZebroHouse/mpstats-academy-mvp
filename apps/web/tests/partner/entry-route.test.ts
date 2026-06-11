// apps/web/tests/partner/entry-route.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockAdmin = { auth: { admin: { createUser: vi.fn(), generateLink: vi.fn() }, verifyOtp: vi.fn() } };
vi.mock('@/lib/auth/supabase-admin', () => ({ getSupabaseAdmin: () => mockAdmin }));

const mockServerSupabase = { auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) } };
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(async () => mockServerSupabase) }));

vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(() => ({ auth: { setSession: vi.fn().mockResolvedValue({ error: null }) } })),
}));

const mockPrisma = {
  $queryRaw: vi.fn().mockResolvedValue([]),
  userProfile: { upsert: vi.fn().mockResolvedValue({}) },
  lesson: { findFirst: vi.fn().mockResolvedValue(null) },
};
vi.mock('@mpstats/db/client', () => ({ prisma: mockPrisma }));

const mockCq = { firePartnerEntryLead: vi.fn().mockResolvedValue(undefined), sendPartnerConfirmEmail: vi.fn().mockResolvedValue(undefined) };
vi.mock('@/lib/carrotquest/emails', () => mockCq);

import { GET } from '@/app/api/partner/mpstats/enter/route';
const req = (qs: string) => new Request(`https://platform.test/api/partner/mpstats/enter?${qs}`);

describe('GET /api/partner/mpstats/enter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.PARTNER_COURSES_ENABLED = 'true';
    process.env.NEXT_PUBLIC_SITE_URL = 'https://platform.test';
    process.env.MPSTATS_PARTNER_SIGNING_SECRET = 'secret';
    mockPrisma.$queryRaw.mockResolvedValue([]);
    mockPrisma.lesson.findFirst.mockResolvedValue(null);
    mockAdmin.auth.admin.createUser.mockResolvedValue({ data: { user: { id: 'new-uid', email: 'new@x.com' } }, error: null });
    mockAdmin.auth.admin.generateLink.mockResolvedValue({ data: { properties: { hashed_token: 'tok123' } }, error: null });
    mockAdmin.auth.verifyOtp.mockResolvedValue({ data: { session: { access_token: 'at', refresh_token: 'rt' } }, error: null });
    mockServerSupabase.auth.getUser.mockResolvedValue({ data: { user: null } });
  });

  it('redirects to / when the flag is off', async () => {
    process.env.PARTNER_COURSES_ENABLED = '';
    const res = await GET(req('email=a@b.com'));
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe('https://platform.test/');
  });

  it('redirects to / when email is missing', async () => {
    const res = await GET(req('name=Ivan'));
    expect(res.headers.get('location')).toBe('https://platform.test/');
  });

  it('untrusted new email: creates pending-verify user, sets session, redirects to lesson (no email)', async () => {
    mockPrisma.lesson.findFirst.mockResolvedValue({ id: 'lesson-9' });
    const res = await GET(req('email=new@x.com&name=Ivan&module_code=auto_bidder'));
    expect(mockAdmin.auth.admin.createUser).toHaveBeenCalledWith(expect.objectContaining({
      email: 'new@x.com', email_confirm: true,
      user_metadata: expect.objectContaining({ partner_pending_verify: true }),
    }));
    expect(mockCq.firePartnerEntryLead).toHaveBeenCalledWith('new-uid', expect.objectContaining({ email: 'new@x.com', moduleCode: 'auto_bidder' }));
    expect(mockAdmin.auth.verifyOtp).toHaveBeenCalledWith({ token_hash: 'tok123', type: 'magiclink' });
    expect(mockCq.sendPartnerConfirmEmail).not.toHaveBeenCalled();
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe('https://platform.test/mpstats-tools/lesson-9');
  });

  it('falls back to catalog when module_code has no lesson', async () => {
    const res = await GET(req('email=new@x.com&module_code=uzum'));
    expect(res.headers.get('location')).toBe('https://platform.test/mpstats-tools');
  });
});
