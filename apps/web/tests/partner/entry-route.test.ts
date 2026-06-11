// apps/web/tests/partner/entry-route.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHmac } from 'node:crypto';
const signEntry = (f: { email: string; phone?: string; name?: string; moduleCode?: string; exp: number }) =>
  createHmac('sha256', 'secret').update([f.email, f.phone ?? '', f.name ?? '', f.moduleCode ?? '', String(f.exp)].join('|')).digest('hex');

const h = vi.hoisted(() => ({
  admin: { auth: { admin: { createUser: vi.fn(), generateLink: vi.fn() }, verifyOtp: vi.fn() } },
  server: { auth: { getUser: vi.fn() } },
  prisma: { $queryRaw: vi.fn(), userProfile: { upsert: vi.fn() }, lesson: { findFirst: vi.fn() } },
  cq: { firePartnerEntryLead: vi.fn(), sendPartnerConfirmEmail: vi.fn() },
  setSession: vi.fn(),
}));

vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn(), setTags: vi.fn(), setUser: vi.fn(), startSpan: (_o: any, f: any) => f() }));
vi.mock('@/lib/auth/supabase-admin', () => ({ getSupabaseAdmin: () => h.admin }));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(async () => h.server) }));
vi.mock('@supabase/ssr', () => ({ createServerClient: vi.fn(() => ({ auth: { setSession: h.setSession } })) }));
vi.mock('@mpstats/db/client', () => ({ prisma: h.prisma }));
vi.mock('@/lib/carrotquest/emails', () => ({ firePartnerEntryLead: h.cq.firePartnerEntryLead, sendPartnerConfirmEmail: h.cq.sendPartnerConfirmEmail }));

import { GET } from '@/app/api/partner/mpstats/enter/route';
const req = (qs: string) => new Request(`https://platform.test/api/partner/mpstats/enter?${qs}`);

describe('GET /api/partner/mpstats/enter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.PARTNER_COURSES_ENABLED = 'true';
    process.env.PARTNER_ENTRY_ENABLED = 'true';
    process.env.NEXT_PUBLIC_SITE_URL = 'https://platform.test';
    process.env.MPSTATS_PARTNER_SIGNING_SECRET = 'secret';
    h.prisma.$queryRaw.mockResolvedValue([]);
    h.prisma.lesson.findFirst.mockResolvedValue(null);
    h.prisma.userProfile.upsert.mockResolvedValue({});
    h.admin.auth.admin.createUser.mockResolvedValue({ data: { user: { id: 'new-uid', email: 'new@x.com' } }, error: null });
    h.admin.auth.admin.generateLink.mockResolvedValue({ data: { properties: { hashed_token: 'tok123' } }, error: null });
    h.admin.auth.verifyOtp.mockResolvedValue({ data: { session: { access_token: 'at', refresh_token: 'rt' } }, error: null });
    h.server.auth.getUser.mockResolvedValue({ data: { user: null } });
    h.cq.firePartnerEntryLead.mockResolvedValue(undefined);
    h.cq.sendPartnerConfirmEmail.mockResolvedValue(undefined);
    h.setSession.mockResolvedValue({ error: null });
  });

  it('redirects to / when the flag is off', async () => {
    process.env.PARTNER_COURSES_ENABLED = '';
    const res = await GET(req('email=a@b.com'));
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe('https://platform.test/');
  });

  it('redirects to / when PARTNER_ENTRY_ENABLED is off (even if courses enabled)', async () => {
    process.env.PARTNER_ENTRY_ENABLED = '';
    const res = await GET(req('email=a@b.com'));
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe('https://platform.test/');
  });

  it('redirects to / when email is missing', async () => {
    const res = await GET(req('name=Ivan'));
    expect(res.headers.get('location')).toBe('https://platform.test/');
  });

  it('untrusted new email: creates pending-verify user, sets session, redirects to onboarding wizard with ?next=lesson', async () => {
    h.prisma.lesson.findFirst.mockResolvedValue({ id: 'lesson-9' });
    const res = await GET(req('email=new@x.com&name=Ivan&module_code=auto_bidder'));
    expect(h.admin.auth.admin.createUser).toHaveBeenCalledWith(expect.objectContaining({
      email: 'new@x.com', email_confirm: true,
      user_metadata: expect.objectContaining({ partner_pending_verify: true }),
    }));
    expect(h.cq.firePartnerEntryLead).toHaveBeenCalledWith('new-uid', expect.objectContaining({ email: 'new@x.com', moduleCode: 'auto_bidder' }));
    expect(h.admin.auth.verifyOtp).toHaveBeenCalledWith({ token_hash: 'tok123', type: 'magiclink' });
    expect(h.cq.sendPartnerConfirmEmail).not.toHaveBeenCalled();
    expect(res.status).toBe(307);
    // New users have no onboardingCompletedAt, so the (main) layout guard will bounce
    // them to /welcome. We preserve the intended lesson as ?next= for post-wizard redirect.
    expect(res.headers.get('location')).toBe(
      'https://platform.test/welcome?next=%2Fmpstats-tools%2Flesson-9',
    );
  });

  it('falls back to catalog when module_code has no lesson (still via onboarding wizard)', async () => {
    const res = await GET(req('email=new@x.com&module_code=uzum'));
    expect(res.headers.get('location')).toBe(
      'https://platform.test/welcome?next=%2Fmpstats-tools',
    );
  });

  it('trusted new user: creates user, sets session, redirects to lesson (no email)', async () => {
    h.prisma.lesson.findFirst.mockResolvedValue({ id: 'lesson-9' });
    const exp = Math.floor(Date.now() / 1000) + 60;
    const sig = signEntry({ email: 'new@x.com', name: 'Ivan', moduleCode: 'auto_bidder', exp });
    const res = await GET(req(`email=new@x.com&name=Ivan&module_code=auto_bidder&exp=${exp}&sig=${sig}`));
    expect(h.admin.auth.admin.createUser).toHaveBeenCalledWith(expect.objectContaining({ email: 'new@x.com', email_confirm: true }));
    expect(h.admin.auth.verifyOtp).toHaveBeenCalledWith({ token_hash: 'tok123', type: 'magiclink' });
    expect(res.headers.get('location')).toBe('https://platform.test/mpstats-tools/lesson-9');
  });

  it('trusted existing user: no createUser, sets session, redirects to lesson', async () => {
    h.prisma.$queryRaw.mockResolvedValue([{ id: 'old-uid', email: 'old@x.com' }]);
    h.prisma.lesson.findFirst.mockResolvedValue({ id: 'lesson-9' });
    const exp = Math.floor(Date.now() / 1000) + 60;
    const sig = signEntry({ email: 'old@x.com', moduleCode: 'auto_bidder', exp });
    const res = await GET(req(`email=old@x.com&module_code=auto_bidder&exp=${exp}&sig=${sig}`));
    expect(h.admin.auth.admin.createUser).not.toHaveBeenCalled();
    expect(res.headers.get('location')).toBe('https://platform.test/mpstats-tools/lesson-9');
  });

  it('untrusted existing + already logged in as them: straight redirect to lesson', async () => {
    h.prisma.$queryRaw.mockResolvedValue([{ id: 'old-uid', email: 'old@x.com' }]);
    h.prisma.lesson.findFirst.mockResolvedValue({ id: 'lesson-9' });
    h.server.auth.getUser.mockResolvedValue({ data: { user: { email: 'old@x.com' } } });
    const res = await GET(req('email=old@x.com&module_code=auto_bidder'));
    expect(h.admin.auth.admin.generateLink).not.toHaveBeenCalled();
    expect(h.cq.sendPartnerConfirmEmail).not.toHaveBeenCalled();
    expect(res.headers.get('location')).toBe('https://platform.test/mpstats-tools/lesson-9');
  });

  it('untrusted existing + no session: emails confirm link, redirects to check-email', async () => {
    h.prisma.$queryRaw.mockResolvedValue([{ id: 'old-uid', email: 'old@x.com' }]);
    h.server.auth.getUser.mockResolvedValue({ data: { user: null } });
    const res = await GET(req('email=old@x.com'));
    expect(h.admin.auth.admin.createUser).not.toHaveBeenCalled();
    expect(h.cq.sendPartnerConfirmEmail).toHaveBeenCalledWith('old-uid', expect.objectContaining({
      email: 'old@x.com', confirmUrl: expect.stringContaining('/auth/confirm?token_hash=tok123&type=magiclink'),
    }));
    expect(res.headers.get('location')).toContain('/partner/check-email');
  });

  it('case-variant email for existing user takes magic-link path (not error page)', async () => {
    h.prisma.$queryRaw.mockResolvedValue([{ id: 'old-uid', email: 'old@x.com' }]);
    h.server.auth.getUser.mockResolvedValue({ data: { user: null } });
    const res = await GET(req('email=Old@X.com'));
    expect(h.admin.auth.admin.createUser).not.toHaveBeenCalled();
    expect(h.prisma.$queryRaw).toHaveBeenCalled(); // lookup ran with lowercased email
    expect(h.cq.sendPartnerConfirmEmail).toHaveBeenCalled();
    expect(res.headers.get('location')).toContain('/partner/check-email');
  });

  it('tampered signature on existing user does NOT establish a session', async () => {
    h.prisma.$queryRaw.mockResolvedValue([{ id: 'old-uid', email: 'old@x.com' }]);
    h.server.auth.getUser.mockResolvedValue({ data: { user: null } });
    const exp = Math.floor(Date.now() / 1000) + 60;
    const res = await GET(req(`email=old@x.com&exp=${exp}&sig=deadbeef`));
    expect(h.admin.auth.verifyOtp).not.toHaveBeenCalled();
    expect(h.cq.sendPartnerConfirmEmail).toHaveBeenCalled();
    expect(res.headers.get('location')).toContain('/partner/check-email');
  });
});
