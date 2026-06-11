# MPSTATS Seamless Auth (Partner Entry) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A public entry endpoint that receives a user from the MPSTATS service (`name/phone/email/module_code`), drops a **brand-new** email straight into the free partner course with a live session (no email round-trip), proves ownership via magic-link for existing emails, and softly nudges email confirmation with a non-blocking banner — without touching billing.

**Architecture:** One public Next.js route handler `GET /api/partner/mpstats/enter`. It resolves `module_code → lessonId`, fires a CQ lead, then branches on trust. **Trusted (HMAC-signed) branch is built and tested but dormant** — MPSTATS (Igor) is frontend-only and cannot sign server-side, so no signer exists day-1; the branch lights up unchanged if a signing backend ever appears. **Untrusted (plain GET) is the day-1 path:** a new email → create user (`email_confirm:true`, `user_metadata.partner_pending_verify:true`) + establish a session server-side (the Yandex-callback pattern: `generateLink('magiclink')` → `verifyOtp` → `setSession` cookies) → 302 to the lesson; an existing email → straight in if the request already carries that user's session cookie, else magic-link to their inbox (delivered by firing the **existing** `pa_doi` CQ event with the confirm link — no email-hook change, no new CQ rule). A non-blocking "confirm your email" banner shows for `partner_pending_verify` users; confirming clears the flag. **No payment gate, no new schema field, no backfill.**

**Tech Stack:** Next.js 14 App Router (route handlers), Supabase Auth Admin API + `@supabase/ssr`, Prisma (`@mpstats/db`), CarrotQuest client, Node `crypto` (HMAC), Vitest.

---

## Reference: established patterns to mirror

- **Server-side session creation** — `apps/web/src/app/api/auth/yandex/callback/route.ts:117-198`: `getSupabaseAdmin()` → `admin.auth.admin.generateLink({type:'magiclink', email})` → `admin.auth.verifyOtp({token_hash: linkData.properties.hashed_token, type:'magiclink'})` → build `NextResponse.redirect` → `createServerClient(...).auth.setSession(...)` with a `setAll` writing onto `response.cookies`.
- **Existing-user lookup (no pagination bug)** — raw SQL: `prisma.$queryRaw\`SELECT id::text AS id, email FROM auth.users WHERE email = ${email} LIMIT 1\`` (same file, lines 49-56).
- **Same-domain confirm link + existing DOI delivery** — `pa_doi` is fired by setting `pa_doi` user-prop + `cq.trackEvent(userId,'pa_doi')` (`apps/web/src/app/api/webhooks/supabase-email/route.ts:113-124`). `/auth/confirm` already accepts `type=magiclink` + `next` (`apps/web/src/app/auth/confirm/route.ts:21,99`). Confirm URL shape: `${SITE_URL}/auth/confirm?token_hash=<hashed_token>&type=magiclink&next=<target>`.
- **Reading current session** — `createClient()` from `@/lib/supabase/server` → `supabase.auth.getUser()`. `(main)/layout.tsx:30-33` already does this and renders banners (`ReferralBanner`).
- **CQ** — `cq.setUserProps(userId, {...})` + `cq.trackEvent(userId, name, params?)` from `@/lib/carrotquest/client`.
- **Route-handler test mocking** — `apps/web/tests/auth/yandex-oauth.test.ts:1-70`.
- **user_metadata flag pattern** — `pending_promo` in `(main)/layout.tsx:42` + cleared elsewhere; mirror for `partner_pending_verify`.

## File structure

| File | Responsibility |
|------|----------------|
| `apps/web/src/lib/partner/signature.ts` (create) | Pure HMAC verification (trusted, dormant). |
| `apps/web/src/lib/partner/resolve-module.ts` (create) | `module_code → lessonId` via Prisma (public). |
| `apps/web/src/lib/carrotquest/emails.ts` (modify) | `firePartnerEntryLead` + `sendPartnerConfirmEmail` (reuses `pa_doi`). |
| `apps/web/src/lib/carrotquest/types.ts` (modify) | Add `pa_partner_entry` to `CQEventName`. |
| `apps/web/src/app/api/partner/mpstats/enter/route.ts` (create) | Public entry handler (orchestration). |
| `apps/web/src/app/api/partner/verify/resend/route.ts` (create) | Resend confirm link for the banner. |
| `apps/web/src/app/auth/confirm/route.ts` (modify) | Clear `partner_pending_verify` on successful confirm. |
| `apps/web/src/app/partner/check-email/page.tsx` (create) | "We emailed you a link" landing. |
| `apps/web/src/components/partner/PartnerVerifyBanner.tsx` (create) | Non-blocking confirm-email banner. |
| `apps/web/src/app/(main)/layout.tsx` (modify) | Mount the banner for `partner_pending_verify` users. |
| `apps/web/src/middleware.ts` (modify) | Allow `/partner/*` public paths. |
| Tests | `__tests__/signature.test.ts`, `__tests__/resolve-module.test.ts`, `__tests__/partner-emails.test.ts`, `tests/partner/entry-route.test.ts`. |

**Test commands** (repo root): web `pnpm --filter @mpstats/web test -- <path>`; api `pnpm --filter @mpstats/api test`; typecheck `pnpm typecheck`.

---

## Task 1: CQ event name

**Files:** Modify `apps/web/src/lib/carrotquest/types.ts`

- [ ] **Step 1:** In `CQEventName` (ends `| 'pa_diagnostic_completed';`) replace the trailing line with:

```typescript
  | 'pa_diagnostic_completed'

  // Partner entry (MPSTATS seamless auth, Phase 2)
  | 'pa_partner_entry';
```

- [ ] **Step 2:** Run `pnpm typecheck` → PASS.
- [ ] **Step 3:** Commit:

```bash
git add apps/web/src/lib/carrotquest/types.ts
git commit -m "feat(partner): add pa_partner_entry CQ event name"
```

---

## Task 2: Signature verification helper (pure, dormant trusted path)

Canonical string MPSTATS must sign (future): `{email}|{phone}|{name}|{module_code}|{exp}`, missing optional = empty string, `exp` = Unix **seconds**, HMAC-SHA256 hex.

**Files:** Create `apps/web/src/lib/partner/signature.ts`; Test `apps/web/src/lib/partner/__tests__/signature.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/web/src/lib/partner/__tests__/signature.test.ts
import { describe, it, expect } from 'vitest';
import { createHmac } from 'node:crypto';
import { verifyPartnerSignature, partnerCanonicalString } from '../signature';

const SECRET = 'test-secret';
const NOW = 1_000_000;
function sign(f: { email: string; phone?: string; name?: string; moduleCode?: string; exp: number }) {
  return createHmac('sha256', SECRET).update(partnerCanonicalString(f)).digest('hex');
}

describe('verifyPartnerSignature', () => {
  const base = { email: 'a@b.com', phone: '+79990001122', name: 'Иван', moduleCode: 'auto_bidder', exp: NOW + 60 };
  it('accepts a valid, unexpired signature', () => {
    expect(verifyPartnerSignature({ ...base, sig: sign(base) }, SECRET, NOW)).toBe(true);
  });
  it('rejects a tampered email', () => {
    expect(verifyPartnerSignature({ ...base, email: 'evil@x.com', sig: sign(base) }, SECRET, NOW)).toBe(false);
  });
  it('rejects an expired signature', () => {
    const e = { ...base, exp: NOW - 1 };
    expect(verifyPartnerSignature({ ...e, sig: sign(e) }, SECRET, NOW)).toBe(false);
  });
  it('rejects exp too far in the future (> 600s)', () => {
    const f = { ...base, exp: NOW + 601 };
    expect(verifyPartnerSignature({ ...f, sig: sign(f) }, SECRET, NOW)).toBe(false);
  });
  it('rejects empty secret', () => {
    expect(verifyPartnerSignature({ ...base, sig: sign(base) }, '', NOW)).toBe(false);
  });
  it('handles missing optional fields', () => {
    const m = { email: 'a@b.com', exp: NOW + 60 };
    expect(verifyPartnerSignature({ ...m, sig: sign(m) }, SECRET, NOW)).toBe(true);
  });
});
```

- [ ] **Step 2:** Run `pnpm --filter @mpstats/web test -- src/lib/partner/__tests__/signature.test.ts` → FAIL (module missing).
- [ ] **Step 3: Implement**

```typescript
// apps/web/src/lib/partner/signature.ts
import { createHmac, timingSafeEqual } from 'node:crypto';

const MAX_TTL_SECONDS = 600;

export interface PartnerSignedFields {
  email: string;
  phone?: string;
  name?: string;
  moduleCode?: string;
  exp: number;
}

export function partnerCanonicalString(f: PartnerSignedFields): string {
  return [f.email, f.phone ?? '', f.name ?? '', f.moduleCode ?? '', String(f.exp)].join('|');
}

function safeEqualHex(a: string, b: string): boolean {
  const ba = Buffer.from(a, 'hex');
  const bb = Buffer.from(b, 'hex');
  if (ba.length === 0 || ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

export function verifyPartnerSignature(
  input: PartnerSignedFields & { sig: string },
  secret: string,
  nowSeconds: number,
): boolean {
  if (!secret || !input.sig || !Number.isFinite(input.exp)) return false;
  if (input.exp < nowSeconds) return false;
  if (input.exp > nowSeconds + MAX_TTL_SECONDS) return false;
  const expected = createHmac('sha256', secret).update(partnerCanonicalString(input)).digest('hex');
  return safeEqualHex(expected, input.sig);
}
```

- [ ] **Step 4:** Re-run → PASS (6 tests).
- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/partner/signature.ts apps/web/src/lib/partner/__tests__/signature.test.ts
git commit -m "feat(partner): HMAC signature verification (dormant trusted path)"
```

---

## Task 3: Module resolution helper

Mirrors `partner.resolveModule` (`packages/api/src/routers/partner.ts:48-64`) as a public, auth-free function.

**Files:** Create `apps/web/src/lib/partner/resolve-module.ts`; Test `apps/web/src/lib/partner/__tests__/resolve-module.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/web/src/lib/partner/__tests__/resolve-module.test.ts
import { describe, it, expect, vi } from 'vitest';
import { resolvePartnerLessonId } from '../resolve-module';

const mk = (rv: { id: string } | null) => ({ lesson: { findFirst: vi.fn().mockResolvedValue(rv) } } as any);

describe('resolvePartnerLessonId', () => {
  it('returns lessonId for a known module code', async () => {
    const prisma = mk({ id: 'lesson-123' });
    await expect(resolvePartnerLessonId(prisma, 'auto_bidder')).resolves.toBe('lesson-123');
    expect(prisma.lesson.findFirst).toHaveBeenCalledWith({
      where: { isHidden: false, course: { partnerKey: 'mpstats', isHidden: false }, metadata: { path: ['partnerModuleKey'], equals: 'auto_bidder' } },
      select: { id: true },
    });
  });
  it('returns null for unknown / contentless code', async () => {
    await expect(resolvePartnerLessonId(mk(null), 'uzum')).resolves.toBeNull();
  });
  it('returns null for empty input without querying', async () => {
    const prisma = mk(null);
    await expect(resolvePartnerLessonId(prisma, '')).resolves.toBeNull();
    expect(prisma.lesson.findFirst).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2:** Run the test → FAIL.
- [ ] **Step 3: Implement**

```typescript
// apps/web/src/lib/partner/resolve-module.ts
import type { PrismaClient } from '@prisma/client';

export const MPSTATS_PARTNER_KEY = 'mpstats';

export async function resolvePartnerLessonId(
  prisma: Pick<PrismaClient, 'lesson'>,
  moduleCode: string,
): Promise<string | null> {
  if (!moduleCode) return null;
  const lesson = await prisma.lesson.findFirst({
    where: {
      isHidden: false,
      course: { partnerKey: MPSTATS_PARTNER_KEY, isHidden: false },
      metadata: { path: ['partnerModuleKey'], equals: moduleCode },
    },
    select: { id: true },
  });
  return lesson?.id ?? null;
}
```

> If `pnpm typecheck` flags the `@prisma/client` import (CLAUDE.md vite-resolve gotcha), switch to `import type { PrismaClient } from '@mpstats/db';`.

- [ ] **Step 4:** Re-run → PASS (3 tests).
- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/partner/resolve-module.ts apps/web/src/lib/partner/__tests__/resolve-module.test.ts
git commit -m "feat(partner): public module_code -> lessonId resolver"
```

---

## Task 4: CQ helpers — entry lead + confirm email (reuses pa_doi)

**Files:** Modify `apps/web/src/lib/carrotquest/emails.ts`; Test `apps/web/src/lib/carrotquest/__tests__/partner-emails.test.ts`

- [ ] **Step 1: Open `emails.ts`** and note the exact `isEmailEnabled` import path and the `reportEmailError` helper name. Mirror them below and in the test mock.

- [ ] **Step 2: Write the failing test**

```typescript
// apps/web/src/lib/carrotquest/__tests__/partner-emails.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../client', () => ({
  cq: { setUserProps: vi.fn().mockResolvedValue(undefined), trackEvent: vi.fn().mockResolvedValue(undefined) },
}));
// Match the real isEmailEnabled import path used in emails.ts (fix after Step 1).
vi.mock('../../feature-flags', () => ({ isEmailEnabled: vi.fn().mockResolvedValue(true) }), { virtual: true });

import { cq } from '../client';
import { firePartnerEntryLead, sendPartnerConfirmEmail } from '../emails';

describe('partner CQ helpers', () => {
  beforeEach(() => vi.clearAllMocks());

  it('firePartnerEntryLead sets source props and tracks pa_partner_entry', async () => {
    await firePartnerEntryLead('u1', { email: 'a@b.com', name: 'Иван', phone: '+7999', moduleCode: 'seo' });
    expect(cq.setUserProps).toHaveBeenCalledWith('u1', expect.objectContaining({
      '$email': 'a@b.com', pa_partner_source: 'mpstats', pa_partner_module: 'seo',
    }));
    expect(cq.trackEvent).toHaveBeenCalledWith('u1', 'pa_partner_entry');
  });

  it('sendPartnerConfirmEmail fires the existing pa_doi event with the confirm link', async () => {
    await sendPartnerConfirmEmail('u2', { email: 'a@b.com', name: 'Иван', confirmUrl: 'https://x/auth/confirm?token_hash=abc' });
    expect(cq.setUserProps).toHaveBeenCalledWith('u2', expect.objectContaining({
      '$email': 'a@b.com', pa_doi: 'https://x/auth/confirm?token_hash=abc',
    }));
    expect(cq.trackEvent).toHaveBeenCalledWith('u2', 'pa_doi');
  });
});
```

- [ ] **Step 3:** Run `pnpm --filter @mpstats/web test -- src/lib/carrotquest/__tests__/partner-emails.test.ts` → FAIL (exports missing).

- [ ] **Step 4: Implement** — append to `emails.ts` (reuse existing `cq`, `isEmailEnabled`, `reportEmailError`):

```typescript
/**
 * MPSTATS partner-entry lead. Records source + module and fires pa_partner_entry.
 * Always runs (lead quality matters even if the email toggle is off). Best-effort.
 */
export async function firePartnerEntryLead(
  userId: string,
  data: { email: string; name?: string; phone?: string; moduleCode?: string },
): Promise<void> {
  try {
    await cq.setUserProps(userId, {
      '$email': data.email,
      ...(data.name ? { '$name': data.name, pa_name: data.name } : {}),
      ...(data.phone ? { '$phone': data.phone, pa_phone: data.phone } : {}),
      pa_partner_source: 'mpstats',
      ...(data.moduleCode ? { pa_partner_module: data.moduleCode } : {}),
    });
    await cq.trackEvent(userId, 'pa_partner_entry');
  } catch (error) {
    reportEmailError('firePartnerEntryLead', userId, error);
  }
}

/**
 * Sends a same-domain confirm link by reusing the EXISTING pa_doi CQ automation rule
 * (no email-hook change, no new CQ rule). Used for existing-user magic-link login and
 * the verify-email banner resend. Best-effort.
 */
export async function sendPartnerConfirmEmail(
  userId: string,
  data: { email: string; name?: string; confirmUrl: string },
): Promise<void> {
  try {
    if (!(await isEmailEnabled())) return;
    await cq.setUserProps(userId, {
      '$email': data.email,
      ...(data.name ? { '$name': data.name, pa_name: data.name } : {}),
      pa_doi: data.confirmUrl,
    });
    await cq.trackEvent(userId, 'pa_doi');
  } catch (error) {
    reportEmailError('sendPartnerConfirmEmail', userId, error);
  }
}
```

> If `emails.ts` does not import `isEmailEnabled`, drop that guard line from `sendPartnerConfirmEmail` and remove the corresponding mock from the test.

- [ ] **Step 5:** Re-run → PASS (2 tests).
- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/carrotquest/emails.ts apps/web/src/lib/carrotquest/__tests__/partner-emails.test.ts
git commit -m "feat(partner): CQ entry-lead + confirm-email helpers"
```

---

## Task 5: Entry route — gate, parse, resolve, lead, new-email auto-session

**Files:** Create `apps/web/src/app/api/partner/mpstats/enter/route.ts`; Test `apps/web/tests/partner/entry-route.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
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
```

- [ ] **Step 2:** Run `pnpm --filter @mpstats/web test -- tests/partner/entry-route.test.ts` → FAIL (route missing).

- [ ] **Step 3: Implement**

```typescript
// apps/web/src/app/api/partner/mpstats/enter/route.ts
import { NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { prisma } from '@mpstats/db/client';
import { getSupabaseAdmin } from '@/lib/auth/supabase-admin';
import { createClient } from '@/lib/supabase/server';
import { resolvePartnerLessonId } from '@/lib/partner/resolve-module';
import { verifyPartnerSignature } from '@/lib/partner/signature';
import { firePartnerEntryLead, sendPartnerConfirmEmail } from '@/lib/carrotquest/emails';

export const dynamic = 'force-dynamic';

/**
 * Public entry from the MPSTATS service. NEVER logs the PII query params.
 * Design: docs/superpowers/specs/2026-06-10-mpstats-tools-seamless-auth-design.md
 */
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const origin = process.env.NEXT_PUBLIC_SITE_URL || url.origin;
  const home = () => NextResponse.redirect(new URL('/', origin));

  if (process.env.PARTNER_COURSES_ENABLED !== 'true') return home();

  const email = (url.searchParams.get('email') || '').trim();
  if (!email) return home();
  const name = url.searchParams.get('name') || undefined;
  const phone = url.searchParams.get('phone') || undefined;
  const moduleCode = url.searchParams.get('module_code') || '';
  const sig = url.searchParams.get('sig') || '';
  const exp = url.searchParams.get('exp') ? Number(url.searchParams.get('exp')) : NaN;

  try {
    const lessonId = await resolvePartnerLessonId(prisma, moduleCode);
    const target = lessonId ? `/mpstats-tools/${lessonId}` : '/mpstats-tools';

    const secret = process.env.MPSTATS_PARTNER_SIGNING_SECRET || '';
    const nowSeconds = Math.floor(Date.now() / 1000);
    const trusted =
      !!sig && Number.isFinite(exp) &&
      verifyPartnerSignature({ email, phone, name, moduleCode, exp, sig }, secret, nowSeconds);

    const admin = getSupabaseAdmin();
    const existing = await prisma.$queryRaw<Array<{ id: string; email: string }>>`
      SELECT id::text AS id, email FROM auth.users WHERE email = ${email} LIMIT 1
    `;
    const existingUser = existing[0] ?? null;

    // --- Trusted branch (dormant): filled in Task 6 ---

    // --- Untrusted, existing user: filled in Task 7 ---
    if (existingUser) {
      return NextResponse.redirect(new URL('/login', origin)); // placeholder, replaced in Task 7
    }

    // --- Untrusted, brand-new email: auto-create + auto-session ---
    const userId = await createPartnerUser(admin, email, name, /* pendingVerify */ true);
    if (!userId) return NextResponse.redirect(new URL('/login?error=partner_entry', origin));

    await upsertPartnerProfile(userId, name, phone);
    void firePartnerEntryLead(userId, { email, name, phone, moduleCode: moduleCode || undefined });
    return establishSession(admin, email, target, origin);
  } catch (error) {
    Sentry.captureException(error, { tags: { area: 'partner-entry', stage: 'unhandled' } });
    return NextResponse.redirect(new URL('/login?error=partner_entry', origin));
  }
}

/** Creates a partner user (email_confirm:true so the session mints reliably). */
async function createPartnerUser(
  admin: ReturnType<typeof getSupabaseAdmin>,
  email: string,
  name: string | undefined,
  pendingVerify: boolean,
): Promise<string | null> {
  const created = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { full_name: name ?? '', ...(pendingVerify ? { partner_pending_verify: true } : {}) },
  });
  if (created.error || !created.data.user) {
    Sentry.captureException(created.error ?? new Error('createUser returned no user'), { tags: { area: 'partner-entry', stage: 'create-user' } });
    return null;
  }
  return created.data.user.id;
}

async function upsertPartnerProfile(userId: string, name: string | undefined, phone: string | undefined): Promise<void> {
  await prisma.userProfile.upsert({
    where: { id: userId },
    update: { ...(phone ? { phone } : {}) },
    create: { id: userId, name: name ?? null, phone: phone ?? null },
  }).catch((e) => Sentry.captureException(e, { tags: { area: 'partner-entry', stage: 'profile-upsert' } }));
}

/** Mints a session for `email` and returns a redirect to `target` with cookies set. */
async function establishSession(
  admin: ReturnType<typeof getSupabaseAdmin>,
  email: string,
  target: string,
  origin: string,
): Promise<Response> {
  const link = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  const token = link.data?.properties?.hashed_token;
  if (link.error || !token) {
    Sentry.captureException(link.error ?? new Error('generateLink returned no token'), { tags: { area: 'partner-entry', stage: 'generate-link' } });
    return NextResponse.redirect(new URL('/login?error=partner_entry', origin));
  }
  const otp = await admin.auth.verifyOtp({ token_hash: token, type: 'magiclink' });
  if (otp.error || !otp.data.session) {
    Sentry.captureException(otp.error ?? new Error('verifyOtp returned no session'), { tags: { area: 'partner-entry', stage: 'verify-otp' } });
    return NextResponse.redirect(new URL('/login?error=partner_entry', origin));
  }
  const response = NextResponse.redirect(new URL(target, origin));
  const { createServerClient } = await import('@supabase/ssr');
  const ssr = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() { return []; },
        setAll(cookiesToSet: { name: string; value: string; options: Record<string, unknown> }[]) {
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );
  await ssr.auth.setSession({ access_token: otp.data.session.access_token, refresh_token: otp.data.session.refresh_token });
  return response;
}

/** Builds the same-domain confirm URL for magic-link delivery (Task 7 / banner). */
export function buildConfirmUrl(origin: string, tokenHash: string, target: string): string {
  return `${origin}/auth/confirm?token_hash=${tokenHash}&type=magiclink&next=${encodeURIComponent(target)}`;
}
```

- [ ] **Step 4:** Re-run → PASS (4 tests). (Existing-user path is the placeholder, replaced in Task 7.)
- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/api/partner/mpstats/enter/route.ts apps/web/tests/partner/entry-route.test.ts
git commit -m "feat(partner): entry route — gate/parse/resolve/lead + new-email auto-session"
```

---

## Task 6: Entry route — trusted branch (dormant, instant session)

**Files:** Modify `route.ts` + `entry-route.test.ts`

- [ ] **Step 1: Add test** (add the import + helper at top of the test file, then the cases):

```typescript
import { createHmac } from 'node:crypto';
const signEntry = (f: { email: string; phone?: string; name?: string; moduleCode?: string; exp: number }) =>
  createHmac('sha256', 'secret').update([f.email, f.phone ?? '', f.name ?? '', f.moduleCode ?? '', String(f.exp)].join('|')).digest('hex');
```

```typescript
  it('trusted new user: creates user, sets session, redirects to lesson (no email)', async () => {
    mockPrisma.lesson.findFirst.mockResolvedValue({ id: 'lesson-9' });
    const exp = Math.floor(Date.now() / 1000) + 60;
    const sig = signEntry({ email: 'new@x.com', name: 'Ivan', moduleCode: 'auto_bidder', exp });
    const res = await GET(req(`email=new@x.com&name=Ivan&module_code=auto_bidder&exp=${exp}&sig=${sig}`));
    expect(mockAdmin.auth.admin.createUser).toHaveBeenCalledWith(expect.objectContaining({ email: 'new@x.com', email_confirm: true }));
    expect(mockAdmin.auth.verifyOtp).toHaveBeenCalledWith({ token_hash: 'tok123', type: 'magiclink' });
    expect(res.headers.get('location')).toBe('https://platform.test/mpstats-tools/lesson-9');
  });

  it('trusted existing user: no createUser, sets session, redirects to lesson', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([{ id: 'old-uid', email: 'old@x.com' }]);
    mockPrisma.lesson.findFirst.mockResolvedValue({ id: 'lesson-9' });
    const exp = Math.floor(Date.now() / 1000) + 60;
    const sig = signEntry({ email: 'old@x.com', moduleCode: 'auto_bidder', exp });
    const res = await GET(req(`email=old@x.com&module_code=auto_bidder&exp=${exp}&sig=${sig}`));
    expect(mockAdmin.auth.admin.createUser).not.toHaveBeenCalled();
    expect(res.headers.get('location')).toBe('https://platform.test/mpstats-tools/lesson-9');
  });
```

- [ ] **Step 2:** Run → FAIL (signed request still falls into untrusted-new: existing-trusted hits the `/login` placeholder; new-trusted path works only by luck of the new-email branch but creates without trusted semantics — assert the existing-user trusted case fails).

- [ ] **Step 3: Implement** — replace the `// --- Trusted branch (dormant) ... ---` marker with:

```typescript
    if (trusted) {
      const userId = existingUser ? existingUser.id : await createPartnerUser(admin, email, name, /* pendingVerify */ false);
      if (!userId) return NextResponse.redirect(new URL('/login?error=partner_entry', origin));
      await upsertPartnerProfile(userId, name, phone);
      void firePartnerEntryLead(userId, { email, name, phone, moduleCode: moduleCode || undefined });
      return establishSession(admin, email, target, origin);
    }
```

- [ ] **Step 4:** Re-run → PASS (6 tests).
- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/api/partner/mpstats/enter/route.ts apps/web/tests/partner/entry-route.test.ts
git commit -m "feat(partner): trusted branch — instant server-side session (dormant)"
```

---

## Task 7: Entry route — untrusted existing-user branches

Replaces the Task-5 placeholder. (a) request already authed as this email → straight in; (b) else → magic-link to the real inbox via `sendPartnerConfirmEmail` (reuses pa_doi) → `/partner/check-email`. A tampered signature falls through to untrusted (no auto-session).

**Files:** Modify `route.ts` + `entry-route.test.ts`

- [ ] **Step 1: Add tests**

```typescript
  it('untrusted existing + already logged in as them: straight redirect to lesson', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([{ id: 'old-uid', email: 'old@x.com' }]);
    mockPrisma.lesson.findFirst.mockResolvedValue({ id: 'lesson-9' });
    mockServerSupabase.auth.getUser.mockResolvedValue({ data: { user: { email: 'old@x.com' } } });
    const res = await GET(req('email=old@x.com&module_code=auto_bidder'));
    expect(mockAdmin.auth.admin.generateLink).not.toHaveBeenCalled();
    expect(mockCq.sendPartnerConfirmEmail).not.toHaveBeenCalled();
    expect(res.headers.get('location')).toBe('https://platform.test/mpstats-tools/lesson-9');
  });

  it('untrusted existing + no session: emails confirm link, redirects to check-email', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([{ id: 'old-uid', email: 'old@x.com' }]);
    mockServerSupabase.auth.getUser.mockResolvedValue({ data: { user: null } });
    const res = await GET(req('email=old@x.com'));
    expect(mockAdmin.auth.admin.createUser).not.toHaveBeenCalled();
    expect(mockCq.sendPartnerConfirmEmail).toHaveBeenCalledWith('old-uid', expect.objectContaining({
      email: 'old@x.com', confirmUrl: expect.stringContaining('/auth/confirm?token_hash=tok123&type=magiclink'),
    }));
    expect(res.headers.get('location')).toContain('/partner/check-email');
  });

  it('tampered signature on existing user does NOT establish a session', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([{ id: 'old-uid', email: 'old@x.com' }]);
    mockServerSupabase.auth.getUser.mockResolvedValue({ data: { user: null } });
    const exp = Math.floor(Date.now() / 1000) + 60;
    const res = await GET(req(`email=old@x.com&exp=${exp}&sig=deadbeef`));
    expect(mockAdmin.auth.verifyOtp).not.toHaveBeenCalled();
    expect(mockCq.sendPartnerConfirmEmail).toHaveBeenCalled();
    expect(res.headers.get('location')).toContain('/partner/check-email');
  });
```

- [ ] **Step 2:** Run → FAIL (placeholder returns `/login`).

- [ ] **Step 3: Implement** — replace:

```typescript
    if (existingUser) {
      return NextResponse.redirect(new URL('/login', origin)); // placeholder, replaced in Task 7
    }
```

with:

```typescript
    if (existingUser) {
      const server = await createClient();
      const { data: { user: sessionUser } } = await server.auth.getUser();
      if (sessionUser?.email && sessionUser.email.toLowerCase() === email.toLowerCase()) {
        return NextResponse.redirect(new URL(target, origin)); // already logged in on this device
      }
      // Prove ownership via a magic link to the real inbox (reuses pa_doi delivery).
      const link = await admin.auth.admin.generateLink({ type: 'magiclink', email });
      const token = link.data?.properties?.hashed_token;
      if (link.error || !token) {
        Sentry.captureException(link.error ?? new Error('generateLink returned no token'), { tags: { area: 'partner-entry', stage: 'generate-link' } });
        return NextResponse.redirect(new URL('/login?error=partner_entry', origin));
      }
      void firePartnerEntryLead(existingUser.id, { email, name, phone, moduleCode: moduleCode || undefined });
      void sendPartnerConfirmEmail(existingUser.id, { email, name, confirmUrl: buildConfirmUrl(origin, token, target) });
      return NextResponse.redirect(new URL(`/partner/check-email?email=${encodeURIComponent(email)}`, origin));
    }
```

- [ ] **Step 4:** Re-run → PASS (9 tests).
- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/api/partner/mpstats/enter/route.ts apps/web/tests/partner/entry-route.test.ts
git commit -m "feat(partner): untrusted existing-user branches (cookie reuse / magic link)"
```

---

## Task 8: Check-email page + public middleware path

**Files:** Create `apps/web/src/app/partner/check-email/page.tsx`; Modify `apps/web/src/middleware.ts`

- [ ] **Step 1: Page**

```tsx
// apps/web/src/app/partner/check-email/page.tsx
export const dynamic = 'force-dynamic';

export default function PartnerCheckEmailPage({ searchParams }: { searchParams: { email?: string } }) {
  const email = searchParams.email ?? '';
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-6 text-center">
      <h1 className="text-2xl font-semibold">Проверьте почту</h1>
      <p className="mt-3 text-muted-foreground">
        {email ? <>Мы отправили ссылку для входа на <span className="font-medium">{email}</span>.</> : <>Мы отправили ссылку для входа на вашу почту.</>}{' '}
        Перейдите по ней, чтобы открыть бесплатный курс по инструментам MPSTATS.
      </p>
      <p className="mt-4 text-sm text-muted-foreground">Письма нет? Проверьте «Спам» или вернитесь и попробуйте ещё раз.</p>
    </main>
  );
}
```

- [ ] **Step 2: Middleware** — open `apps/web/src/middleware.ts`, find how `/login` / `/register` are whitelisted as public (the matcher or the public-paths list). Add `/partner` (prefix) the same way so `/partner/check-email` is reachable while logged out. Do NOT change auth behavior for other paths.

- [ ] **Step 3:** Run `pnpm typecheck` → PASS.
- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/partner/check-email/page.tsx apps/web/src/middleware.ts
git commit -m "feat(partner): check-email landing page + public route"
```

---

## Task 9: Soft email-verify banner + resend + clear-on-confirm

**Files:** Create `apps/web/src/components/partner/PartnerVerifyBanner.tsx`; Create `apps/web/src/app/api/partner/verify/resend/route.ts`; Modify `apps/web/src/app/(main)/layout.tsx`; Modify `apps/web/src/app/auth/confirm/route.ts`

- [ ] **Step 1: Resend route** (POST, session-protected)

```typescript
// apps/web/src/app/api/partner/verify/resend/route.ts
import { NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/auth/supabase-admin';
import { sendPartnerConfirmEmail } from '@/lib/carrotquest/emails';
import { buildConfirmUrl } from '@/app/api/partner/mpstats/enter/route';

export const dynamic = 'force-dynamic';

export async function POST(): Promise<Response> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return NextResponse.json({ ok: false }, { status: 401 });

  try {
    const admin = getSupabaseAdmin();
    const link = await admin.auth.admin.generateLink({ type: 'magiclink', email: user.email });
    const token = link.data?.properties?.hashed_token;
    if (link.error || !token) {
      Sentry.captureException(link.error ?? new Error('generateLink returned no token'), { tags: { area: 'partner-verify', stage: 'generate-link' } });
      return NextResponse.json({ ok: false }, { status: 500 });
    }
    const origin = process.env.NEXT_PUBLIC_SITE_URL || '';
    await sendPartnerConfirmEmail(user.id, {
      email: user.email,
      name: (user.user_metadata?.full_name as string) || undefined,
      confirmUrl: buildConfirmUrl(origin, token, '/mpstats-tools'),
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    Sentry.captureException(error, { tags: { area: 'partner-verify', stage: 'unhandled' } });
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
```

- [ ] **Step 2: Banner component** (client)

```tsx
// apps/web/src/components/partner/PartnerVerifyBanner.tsx
'use client';
import { useState } from 'react';

export function PartnerVerifyBanner({ email }: { email: string }) {
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');

  async function resend() {
    setState('sending');
    try {
      const res = await fetch('/api/partner/verify/resend', { method: 'POST' });
      setState(res.ok ? 'sent' : 'error');
    } catch {
      setState('error');
    }
  }

  return (
    <div className="flex flex-wrap items-center justify-center gap-2 bg-amber-50 px-4 py-2 text-sm text-amber-900">
      <span>Подтвердите почту <span className="font-medium">{email}</span>, чтобы не потерять доступ.</span>
      {state === 'sent' ? (
        <span className="font-medium">Ссылка отправлена ✓</span>
      ) : (
        <button onClick={resend} disabled={state === 'sending'} className="font-medium underline disabled:opacity-50">
          {state === 'sending' ? 'Отправляем…' : 'Отправить ссылку'}
        </button>
      )}
      {state === 'error' && <span className="text-red-700">Не удалось отправить, попробуйте позже.</span>}
    </div>
  );
}
```

- [ ] **Step 3: Mount in `(main)/layout.tsx`** — `user` is already fetched (line ~32). Add, just inside the returned tree near `ReferralBanner`:

```tsx
{user.user_metadata?.partner_pending_verify === true && (
  <PartnerVerifyBanner email={user.email ?? ''} />
)}
```

And add the import at the top:

```tsx
import { PartnerVerifyBanner } from '@/components/partner/PartnerVerifyBanner';
```

- [ ] **Step 4: Clear flag on confirm** — in `apps/web/src/app/auth/confirm/route.ts`, in the success branch where it already does `supabase.auth.getUser()` (inside the `try` after `verifyOtp`), clear the flag when present:

```typescript
      if (user && user.user_metadata?.partner_pending_verify) {
        const { getSupabaseAdmin } = await import('@/lib/auth/supabase-admin');
        await getSupabaseAdmin().auth.admin.updateUserById(user.id, {
          user_metadata: { ...user.user_metadata, partner_pending_verify: false },
        }).catch((e) => console.error('[AuthConfirm] clear partner_pending_verify failed:', e));
      }
```

- [ ] **Step 5:** Run `pnpm typecheck` → PASS. Run `pnpm --filter @mpstats/web test` → all PASS.
- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/partner/PartnerVerifyBanner.tsx apps/web/src/app/api/partner/verify/resend/route.ts "apps/web/src/app/(main)/layout.tsx" apps/web/src/app/auth/confirm/route.ts
git commit -m "feat(partner): soft email-verify banner + resend + clear-on-confirm"
```

---

## Task 10: Wrap-up — env docs + full suites

**Files:** Modify `.env.example` (if present)

- [ ] **Step 1: Env doc** (placeholder only — never a real secret):

```
# Shared HMAC secret for MPSTATS partner-entry signed links (Phase 2, DORMANT).
# Unset day-1 (Igor is frontend-only, cannot sign). When set + MPSTATS signs,
# the entry endpoint trusts the payload and skips the magic-link step.
MPSTATS_PARTNER_SIGNING_SECRET=<your-shared-secret>
```

If no `.env.example` exists, add this note to the spec's "Открытые вопросы" instead.

- [ ] **Step 2:** Run `pnpm --filter @mpstats/web test` → PASS (all). Run `pnpm --filter @mpstats/api test` → PASS (unchanged). Run `pnpm typecheck` → PASS.
- [ ] **Step 3: Commit**

```bash
git add .env.example
git commit -m "docs(partner): document MPSTATS_PARTNER_SIGNING_SECRET (dormant)"
```

---

## Post-implementation (out of plan scope — coordinate, don't code)

1. **Module mapping table** — agree the 24 MPSTATS codes ↔ our `partnerModuleKey` with Igor; set `Lesson.metadata.partnerModuleKey` on partner lessons (Mgmt API, additive). Codes without a lesson fall back to the catalog automatically.
2. **HMAC secret** — only when a signing backend exists (Igor has none). Until then trusted is dormant; nothing to set.
3. **Rate-limiting** — the new-email branch auto-creates accounts from unauthenticated GETs. Day-1 risk is low (free course, no welcome email = no spam to arbitrary inboxes), but add IP-based rate-limiting on `/api/partner/mpstats/enter` if abuse volume appears. Log creation volume.
4. **Deploy** — staging first (`--no-cache` build + content-check), then prod, behind the existing `PARTNER_COURSES_ENABLED` flag.

## Self-review notes

- **Spec coverage:** endpoint (§1) → T5-7; branching (§2) → T5/6/7; session primitive (§3) → `establishSession`; signature dormant (§4) → T2 + T6; module resolve (§5) → T3; email delivery via pa_doi reuse (§6) → T4 + T7; soft verify banner (§7) → T9; leads (§8) → `firePartnerEntryLead`; security/no-auto-login-without-proof (§9) → T7 + tampered-sig test; "no billing / no schema / no backfill" → respected (no Prisma migration, no billing.ts touched).
- **Type/name consistency:** `verifyPartnerSignature`/`partnerCanonicalString`/`resolvePartnerLessonId`/`firePartnerEntryLead`/`sendPartnerConfirmEmail`/`createPartnerUser`/`upsertPartnerProfile`/`establishSession`/`buildConfirmUrl`/`partner_pending_verify` used identically across tasks. `buildConfirmUrl` is exported from the entry route and reused by the resend route.
- **Open items** are explicitly post-plan (mapping, secret, rate-limit) — not silently dropped.
