# MPSTATS Seamless Auth (Partner Entry) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a public entry endpoint that receives a user from the MPSTATS service (`name/phone/email/module_code`), establishes a platform session (instantly if the payload is HMAC-signed, via magic-link otherwise), and lands them in the requested partner-course lesson.

**Architecture:** One public Next.js route handler `GET /api/partner/mpstats/enter`. It resolves `module_code → lessonId`, fires a CQ lead, then branches on trust: a valid HMAC signature → create/lookup user + establish a Supabase session server-side (the existing Yandex-callback pattern: `generateLink('magiclink')` → `verifyOtp` → `setSession` cookies) → 302 to the lesson; no/invalid signature → never auto-login a stranger — straight redirect only if the request already carries that user's session cookie, otherwise email a same-domain magic link via CarrotQuest and show a "check your email" page. Pure logic (signature verification, module resolution) is isolated into unit-tested helpers; the handler is integration-tested with mocked Supabase Admin/Prisma/CQ following `apps/web/tests/auth/yandex-oauth.test.ts`.

**Tech Stack:** Next.js 14 App Router (route handlers), Supabase Auth Admin API + `@supabase/ssr`, Prisma (`@mpstats/db`), CarrotQuest client, Node `crypto` (HMAC), Vitest.

---

## Reference: established patterns to mirror

- **Server-side session creation** — `apps/web/src/app/api/auth/yandex/callback/route.ts:117-198` (steps 7-10): `getSupabaseAdmin()` → `admin.auth.admin.generateLink({type:'magiclink', email})` → `admin.auth.verifyOtp({token_hash: linkData.properties.hashed_token, type:'magiclink'})` → build `NextResponse.redirect` → `createServerClient(...).auth.setSession({access_token, refresh_token})` with a `setAll` that writes onto `response.cookies`.
- **Existing-user lookup (no pagination bug)** — raw SQL on `auth.users` (same file, lines 49-56): `prisma.$queryRaw\`SELECT id::text AS id, email FROM auth.users WHERE email = ${email} LIMIT 1\``.
- **Same-domain magic-link URL** — `/auth/confirm` already accepts `type=magiclink` + `next` (`apps/web/src/app/auth/confirm/route.ts:21,99`). Email `${SITE_URL}/auth/confirm?token_hash=<hashed_token>&type=magiclink&next=<target>` (NOT the raw `*.supabase.co` action link).
- **Reading the current session from cookies** — `createClient()` from `@/lib/supabase/server` then `supabase.auth.getUser()`.
- **CQ** — `cq.setUserProps(userId, {...})` + `cq.trackEvent(userId, eventName, params?)` from `@/lib/carrotquest/client` (both `by_user_id=true`, need a Supabase user id). Email helpers live in `@/lib/carrotquest/emails`.
- **Route-handler test mocking** — `apps/web/tests/auth/yandex-oauth.test.ts:1-70` (mock `@/lib/auth/supabase-admin`, `@supabase/ssr`, `@mpstats/db/client`, `next/headers`).

## File structure

| File | Responsibility |
|------|----------------|
| `apps/web/src/lib/partner/signature.ts` (create) | Pure HMAC verification of the signed payload. No IO. |
| `apps/web/src/lib/partner/resolve-module.ts` (create) | `module_code → lessonId` via Prisma (public, no auth). |
| `apps/web/src/lib/carrotquest/emails.ts` (modify) | Add `sendPartnerMagicLinkEmail` + lead helper `firePartnerEntryLead`. |
| `apps/web/src/lib/carrotquest/types.ts` (modify) | Add `pa_partner_entry`, `pa_partner_magic_link` to `CQEventName`. |
| `apps/web/src/app/api/partner/mpstats/enter/route.ts` (create) | The public entry handler (orchestration only). |
| `apps/web/src/app/partner/check-email/page.tsx` (create) | Minimal "we emailed you a link" landing page. |
| `apps/web/src/lib/partner/__tests__/signature.test.ts` (create) | Unit tests for signature. |
| `apps/web/src/lib/partner/__tests__/resolve-module.test.ts` (create) | Unit tests for module resolver. |
| `apps/web/tests/partner/entry-route.test.ts` (create) | Integration tests for the handler. |

**Test commands** (run from repo root):
- web: `pnpm --filter @mpstats/web test -- <path>`
- api: `pnpm --filter @mpstats/api test`
- typecheck: `pnpm typecheck`

---

## Task 1: CQ event names

**Files:**
- Modify: `apps/web/src/lib/carrotquest/types.ts`

- [ ] **Step 1: Add the two partner event names to the union**

In `apps/web/src/lib/carrotquest/types.ts`, locate the `CQEventName` union (ends with `| 'pa_diagnostic_completed';`) and add two members before the closing `;`:

```typescript
  | 'pa_diagnostic_completed'

  // Partner entry (MPSTATS seamless auth, Phase 2)
  | 'pa_partner_entry'
  | 'pa_partner_magic_link';
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: PASS (no usages yet, just a wider union).

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/carrotquest/types.ts
git commit -m "feat(partner): add CQ event names for MPSTATS entry"
```

---

## Task 2: Signature verification helper (pure)

The signed payload canonical string is **exactly**:
`{email}|{phone}|{name}|{module_code}|{exp}` — values are the raw (URL-decoded) query values, missing fields are the empty string, `exp` is Unix **seconds**. HMAC-SHA256 hex with the shared secret. This canonical format is the contract MPSTATS must implement identically.

**Files:**
- Create: `apps/web/src/lib/partner/signature.ts`
- Test: `apps/web/src/lib/partner/__tests__/signature.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/web/src/lib/partner/__tests__/signature.test.ts
import { describe, it, expect } from 'vitest';
import { createHmac } from 'node:crypto';
import { verifyPartnerSignature, partnerCanonicalString } from '../signature';

const SECRET = 'test-secret';
const NOW = 1_000_000; // unix seconds

function sign(fields: { email: string; phone?: string; name?: string; moduleCode?: string; exp: number }) {
  const canonical = partnerCanonicalString(fields);
  return createHmac('sha256', SECRET).update(canonical).digest('hex');
}

describe('verifyPartnerSignature', () => {
  const base = { email: 'a@b.com', phone: '+79990001122', name: 'Иван', moduleCode: 'auto_bidder', exp: NOW + 60 };

  it('accepts a valid, unexpired signature', () => {
    const sig = sign(base);
    expect(verifyPartnerSignature({ ...base, sig }, SECRET, NOW)).toBe(true);
  });

  it('rejects a tampered email', () => {
    const sig = sign(base);
    expect(verifyPartnerSignature({ ...base, email: 'evil@x.com', sig }, SECRET, NOW)).toBe(false);
  });

  it('rejects an expired signature', () => {
    const expired = { ...base, exp: NOW - 1 };
    const sig = sign(expired);
    expect(verifyPartnerSignature({ ...expired, sig }, SECRET, NOW)).toBe(false);
  });

  it('rejects exp too far in the future (> 600s)', () => {
    const farFuture = { ...base, exp: NOW + 601 };
    const sig = sign(farFuture);
    expect(verifyPartnerSignature({ ...farFuture, sig }, SECRET, NOW)).toBe(false);
  });

  it('rejects when secret is empty/missing', () => {
    const sig = sign(base);
    expect(verifyPartnerSignature({ ...base, sig }, '', NOW)).toBe(false);
  });

  it('handles missing optional fields (empty string in canonical)', () => {
    const minimal = { email: 'a@b.com', exp: NOW + 60 };
    const sig = sign(minimal);
    expect(verifyPartnerSignature({ ...minimal, sig }, SECRET, NOW)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @mpstats/web test -- src/lib/partner/__tests__/signature.test.ts`
Expected: FAIL — "Cannot find module '../signature'".

- [ ] **Step 3: Write the implementation**

```typescript
// apps/web/src/lib/partner/signature.ts
import { createHmac, timingSafeEqual } from 'node:crypto';

/** Max allowed lifetime of a signed link, in seconds (replay window bound). */
const MAX_TTL_SECONDS = 600;

export interface PartnerSignedFields {
  email: string;
  phone?: string;
  name?: string;
  moduleCode?: string;
  exp: number; // unix seconds
}

/**
 * Canonical string MPSTATS must sign, byte-identical on both sides:
 *   {email}|{phone}|{name}|{module_code}|{exp}
 * Missing optional values are the empty string.
 */
export function partnerCanonicalString(f: PartnerSignedFields): string {
  return [f.email, f.phone ?? '', f.name ?? '', f.moduleCode ?? '', String(f.exp)].join('|');
}

function safeEqualHex(a: string, b: string): boolean {
  const ba = Buffer.from(a, 'hex');
  const bb = Buffer.from(b, 'hex');
  if (ba.length === 0 || ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

/**
 * Verifies the HMAC-SHA256 signature and the expiry window.
 * `nowSeconds` is injected for deterministic tests.
 */
export function verifyPartnerSignature(
  input: PartnerSignedFields & { sig: string },
  secret: string,
  nowSeconds: number,
): boolean {
  if (!secret || !input.sig || !Number.isFinite(input.exp)) return false;
  if (input.exp < nowSeconds) return false; // expired
  if (input.exp > nowSeconds + MAX_TTL_SECONDS) return false; // overly long-lived
  const expected = createHmac('sha256', secret).update(partnerCanonicalString(input)).digest('hex');
  return safeEqualHex(expected, input.sig);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @mpstats/web test -- src/lib/partner/__tests__/signature.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/partner/signature.ts apps/web/src/lib/partner/__tests__/signature.test.ts
git commit -m "feat(partner): HMAC signature verification for signed entry payload"
```

---

## Task 3: Module resolution helper

Mirrors `partner.resolveModule` (`packages/api/src/routers/partner.ts:48-64`) but as a public, auth-free function for use before the user has a session.

**Files:**
- Create: `apps/web/src/lib/partner/resolve-module.ts`
- Test: `apps/web/src/lib/partner/__tests__/resolve-module.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/web/src/lib/partner/__tests__/resolve-module.test.ts
import { describe, it, expect, vi } from 'vitest';
import { resolvePartnerLessonId } from '../resolve-module';

function mockPrisma(returnValue: { id: string } | null) {
  return { lesson: { findFirst: vi.fn().mockResolvedValue(returnValue) } } as any;
}

describe('resolvePartnerLessonId', () => {
  it('returns lessonId for a known module code', async () => {
    const prisma = mockPrisma({ id: 'lesson-123' });
    await expect(resolvePartnerLessonId(prisma, 'auto_bidder')).resolves.toBe('lesson-123');
    expect(prisma.lesson.findFirst).toHaveBeenCalledWith({
      where: {
        isHidden: false,
        course: { partnerKey: 'mpstats', isHidden: false },
        metadata: { path: ['partnerModuleKey'], equals: 'auto_bidder' },
      },
      select: { id: true },
    });
  });

  it('returns null for an unknown / contentless code', async () => {
    const prisma = mockPrisma(null);
    await expect(resolvePartnerLessonId(prisma, 'uzum')).resolves.toBeNull();
  });

  it('returns null for empty input without querying', async () => {
    const prisma = mockPrisma(null);
    await expect(resolvePartnerLessonId(prisma, '')).resolves.toBeNull();
    expect(prisma.lesson.findFirst).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @mpstats/web test -- src/lib/partner/__tests__/resolve-module.test.ts`
Expected: FAIL — "Cannot find module '../resolve-module'".

- [ ] **Step 3: Write the implementation**

```typescript
// apps/web/src/lib/partner/resolve-module.ts
import type { PrismaClient } from '@prisma/client';

export const MPSTATS_PARTNER_KEY = 'mpstats';

/**
 * Resolves an MPSTATS module code to a partner-course lessonId.
 * Public (no auth) — used by the entry handler before a session exists.
 * Returns null for empty input, unknown codes, or codes without a lesson.
 */
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

> Note: `@prisma/client` import in `apps/web` can hit a vite-resolve issue per CLAUDE.md gotcha. If `pnpm typecheck` flags it, change the import to `import type { PrismaClient } from '@mpstats/db';`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @mpstats/web test -- src/lib/partner/__tests__/resolve-module.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/partner/resolve-module.ts apps/web/src/lib/partner/__tests__/resolve-module.test.ts
git commit -m "feat(partner): public module_code -> lessonId resolver"
```

---

## Task 4: CQ helpers — entry lead + magic-link email

**Files:**
- Modify: `apps/web/src/lib/carrotquest/emails.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/web/src/lib/carrotquest/__tests__/partner-emails.test.ts (create)
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../client', () => ({
  cq: { setUserProps: vi.fn().mockResolvedValue(undefined), trackEvent: vi.fn().mockResolvedValue(undefined) },
}));
// isEmailEnabled lives in emails.ts via a FeatureFlag check — force-enable it.
vi.mock('../../feature-flags', () => ({ isEmailEnabled: vi.fn().mockResolvedValue(true) }), { virtual: true });

import { cq } from '../client';
import { firePartnerEntryLead, sendPartnerMagicLinkEmail } from '../emails';

describe('partner CQ helpers', () => {
  beforeEach(() => vi.clearAllMocks());

  it('firePartnerEntryLead sets source props and tracks pa_partner_entry', async () => {
    await firePartnerEntryLead('user-1', { email: 'a@b.com', name: 'Иван', phone: '+7999', moduleCode: 'seo' });
    expect(cq.setUserProps).toHaveBeenCalledWith('user-1', expect.objectContaining({
      '$email': 'a@b.com', pa_partner_source: 'mpstats', pa_partner_module: 'seo',
    }));
    expect(cq.trackEvent).toHaveBeenCalledWith('user-1', 'pa_partner_entry');
  });

  it('sendPartnerMagicLinkEmail sets the link prop and tracks pa_partner_magic_link', async () => {
    await sendPartnerMagicLinkEmail('user-2', { link: 'https://x/confirm?token_hash=abc' });
    expect(cq.setUserProps).toHaveBeenCalledWith('user-2', { pa_partner_magic_link: 'https://x/confirm?token_hash=abc' });
    expect(cq.trackEvent).toHaveBeenCalledWith('user-2', 'pa_partner_magic_link');
  });
});
```

> Before writing, open `apps/web/src/lib/carrotquest/emails.ts` and check how the other helpers gate on email-enabled (`isEmailEnabled()` import path). Mirror that exact import in the new helpers and fix the mock path in this test to match it.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @mpstats/web test -- src/lib/carrotquest/__tests__/partner-emails.test.ts`
Expected: FAIL — `firePartnerEntryLead`/`sendPartnerMagicLinkEmail` are not exported.

- [ ] **Step 3: Write the implementation**

Append to `apps/web/src/lib/carrotquest/emails.ts` (reuse the file's existing `isEmailEnabled` import and `reportEmailError` helper — match their names exactly):

```typescript
/**
 * Fire the MPSTATS partner-entry lead. Records source + module on the CQ lead and
 * fires pa_partner_entry. Best-effort (never throws into the request path).
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
 * Email a same-domain magic link to the user via CarrotQuest (CQ automation rule
 * on pa_partner_magic_link sends the actual email). Best-effort.
 */
export async function sendPartnerMagicLinkEmail(
  userId: string,
  data: { link: string },
): Promise<void> {
  try {
    await cq.setUserProps(userId, { pa_partner_magic_link: data.link });
    await cq.trackEvent(userId, 'pa_partner_magic_link');
  } catch (error) {
    reportEmailError('sendPartnerMagicLinkEmail', userId, error);
  }
}
```

> If `emails.ts` gates every send behind `if (!(await isEmailEnabled())) return;`, keep that guard in `sendPartnerMagicLinkEmail` but NOT in `firePartnerEntryLead` (the lead must be recorded regardless of the email toggle). Adjust the test's `isEmailEnabled` mock accordingly.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @mpstats/web test -- src/lib/carrotquest/__tests__/partner-emails.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/carrotquest/emails.ts apps/web/src/lib/carrotquest/__tests__/partner-emails.test.ts
git commit -m "feat(partner): CQ entry-lead + magic-link email helpers"
```

---

## Task 5: Entry route — gate, parse, module resolve, untrusted-new baseline

This task builds the handler end-to-end for the **simplest** real branch (untrusted, brand-new email → create user + email magic link → check-email page) plus the guard rails (flag off, missing email, module resolve). Trusted and the other untrusted sub-branches come in Tasks 6-7.

**Files:**
- Create: `apps/web/src/app/api/partner/mpstats/enter/route.ts`
- Test: `apps/web/tests/partner/entry-route.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/web/tests/partner/entry-route.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockAdmin = {
  auth: {
    admin: { createUser: vi.fn(), generateLink: vi.fn() },
    verifyOtp: vi.fn(),
  },
};
vi.mock('@/lib/auth/supabase-admin', () => ({ getSupabaseAdmin: () => mockAdmin }));

const mockServerSupabase = { auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) } };
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(async () => mockServerSupabase) }));

vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(() => ({ auth: { setSession: vi.fn().mockResolvedValue({ error: null }) } })),
}));

const mockPrisma = {
  $queryRaw: vi.fn().mockResolvedValue([]), // default: no existing user
  userProfile: { upsert: vi.fn().mockResolvedValue({}) },
  lesson: { findFirst: vi.fn().mockResolvedValue(null) },
};
vi.mock('@mpstats/db/client', () => ({ prisma: mockPrisma }));

const mockCq = { firePartnerEntryLead: vi.fn().mockResolvedValue(undefined), sendPartnerMagicLinkEmail: vi.fn().mockResolvedValue(undefined) };
vi.mock('@/lib/carrotquest/emails', () => mockCq);

import { GET } from '@/app/api/partner/mpstats/enter/route';

function req(qs: string) {
  return new Request(`https://platform.test/api/partner/mpstats/enter?${qs}`);
}

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
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe('https://platform.test/');
  });

  it('untrusted new email: creates user, emails magic link, redirects to check-email', async () => {
    const res = await GET(req('email=new@x.com&name=Ivan&module_code=seo'));
    expect(mockAdmin.auth.admin.createUser).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'new@x.com', email_confirm: false }),
    );
    expect(mockCq.firePartnerEntryLead).toHaveBeenCalledWith('new-uid', expect.objectContaining({ email: 'new@x.com', moduleCode: 'seo' }));
    expect(mockAdmin.auth.admin.generateLink).toHaveBeenCalledWith({ type: 'magiclink', email: 'new@x.com' });
    expect(mockCq.sendPartnerMagicLinkEmail).toHaveBeenCalledWith('new-uid', {
      link: 'https://platform.test/auth/confirm?token_hash=tok123&type=magiclink&next=%2Fmpstats-tools',
    });
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain('/partner/check-email');
  });

  it('resolves module_code into the magic-link next target', async () => {
    mockPrisma.lesson.findFirst.mockResolvedValue({ id: 'lesson-9' });
    await GET(req('email=new@x.com&module_code=auto_bidder'));
    expect(mockCq.sendPartnerMagicLinkEmail).toHaveBeenCalledWith('new-uid', {
      link: 'https://platform.test/auth/confirm?token_hash=tok123&type=magiclink&next=%2Fmpstats-tools%2Flesson-9',
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @mpstats/web test -- tests/partner/entry-route.test.ts`
Expected: FAIL — cannot import `@/app/api/partner/mpstats/enter/route`.

- [ ] **Step 3: Write the implementation**

```typescript
// apps/web/src/app/api/partner/mpstats/enter/route.ts
import { NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { prisma } from '@mpstats/db/client';
import { getSupabaseAdmin } from '@/lib/auth/supabase-admin';
import { createClient } from '@/lib/supabase/server';
import { resolvePartnerLessonId } from '@/lib/partner/resolve-module';
import { verifyPartnerSignature } from '@/lib/partner/signature';
import { firePartnerEntryLead, sendPartnerMagicLinkEmail } from '@/lib/carrotquest/emails';

export const dynamic = 'force-dynamic';

/**
 * Public entry from the MPSTATS service. NEVER logs the PII query params.
 * Branches on trust (HMAC signature) — see the design spec
 * docs/superpowers/specs/2026-06-10-mpstats-tools-seamless-auth-design.md.
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
  const expRaw = url.searchParams.get('exp');
  const exp = expRaw ? Number(expRaw) : NaN;

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

    // --- Trusted branch: filled in Task 6 ---

    // --- Untrusted, existing user: filled in Task 7 ---
    if (existingUser) {
      return NextResponse.redirect(new URL('/login', origin)); // placeholder, replaced in Task 7
    }

    // --- Untrusted, brand-new email: create + email magic link ---
    const created = await admin.auth.admin.createUser({ email, email_confirm: false, user_metadata: { full_name: name ?? '' } });
    if (created.error || !created.data.user) {
      Sentry.captureException(created.error ?? new Error('createUser returned no user'), { tags: { area: 'partner-entry', stage: 'create-user' } });
      return NextResponse.redirect(new URL('/login?error=partner_entry', origin));
    }
    const userId = created.data.user.id;

    await prisma.userProfile.upsert({
      where: { id: userId },
      update: { ...(phone ? { phone } : {}) },
      create: { id: userId, name: name ?? null, phone: phone ?? null },
    }).catch((e) => Sentry.captureException(e, { tags: { area: 'partner-entry', stage: 'profile-upsert' } }));

    void firePartnerEntryLead(userId, { email, name, phone, moduleCode: moduleCode || undefined });
    await emailMagicLink(admin, email, userId, target, origin);

    return NextResponse.redirect(new URL(`/partner/check-email?email=${encodeURIComponent(email)}`, origin));
  } catch (error) {
    Sentry.captureException(error, { tags: { area: 'partner-entry', stage: 'unhandled' } });
    return NextResponse.redirect(new URL('/login?error=partner_entry', origin));
  }
}

/** Generate a same-domain magic link and hand it to CQ for delivery. */
async function emailMagicLink(
  admin: ReturnType<typeof getSupabaseAdmin>,
  email: string,
  userId: string,
  target: string,
  origin: string,
): Promise<void> {
  const link = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  if (link.error || !link.data?.properties?.hashed_token) {
    Sentry.captureException(link.error ?? new Error('generateLink returned no token'), { tags: { area: 'partner-entry', stage: 'generate-link' } });
    return;
  }
  const confirmUrl = `${origin}/auth/confirm?token_hash=${link.data.properties.hashed_token}&type=magiclink&next=${encodeURIComponent(target)}`;
  await sendPartnerMagicLinkEmail(userId, { link: confirmUrl });
}
```

> The `NextResponse.redirect` default status is 307 (matches the test). The `next` value is URL-encoded; `/mpstats-tools` encodes to `%2Fmpstats-tools` and `/mpstats-tools/lesson-9` to `%2Fmpstats-tools%2Flesson-9` — matching the expected strings.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @mpstats/web test -- tests/partner/entry-route.test.ts`
Expected: PASS (4 tests). The existing-user test isn't written yet; the placeholder redirect is replaced in Task 7.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/api/partner/mpstats/enter/route.ts apps/web/tests/partner/entry-route.test.ts
git commit -m "feat(partner): entry route — gate, parse, module resolve, untrusted-new"
```

---

## Task 6: Entry route — trusted branch (instant session)

**Files:**
- Modify: `apps/web/src/app/api/partner/mpstats/enter/route.ts`
- Test: `apps/web/tests/partner/entry-route.test.ts`

- [ ] **Step 1: Write the failing test**

Add inside the existing `describe`, plus this import at the top of the file:

```typescript
import { createHmac } from 'node:crypto';

function signEntry(fields: { email: string; phone?: string; name?: string; moduleCode?: string; exp: number }) {
  const canonical = [fields.email, fields.phone ?? '', fields.name ?? '', fields.moduleCode ?? '', String(fields.exp)].join('|');
  return createHmac('sha256', 'secret').update(canonical).digest('hex');
}
```

```typescript
  it('trusted new user: creates user, establishes session, redirects to lesson (no email)', async () => {
    mockPrisma.lesson.findFirst.mockResolvedValue({ id: 'lesson-9' });
    mockAdmin.auth.verifyOtp.mockResolvedValue({ data: { session: { access_token: 'at', refresh_token: 'rt' } }, error: null });
    const exp = Math.floor(Date.now() / 1000) + 60;
    const sig = signEntry({ email: 'new@x.com', name: 'Ivan', moduleCode: 'auto_bidder', exp });
    const res = await GET(req(`email=new@x.com&name=Ivan&module_code=auto_bidder&exp=${exp}&sig=${sig}`));

    expect(mockAdmin.auth.admin.createUser).toHaveBeenCalledWith(expect.objectContaining({ email: 'new@x.com', email_confirm: true }));
    expect(mockAdmin.auth.verifyOtp).toHaveBeenCalledWith({ token_hash: 'tok123', type: 'magiclink' });
    expect(mockCq.sendPartnerMagicLinkEmail).not.toHaveBeenCalled();
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe('https://platform.test/mpstats-tools/lesson-9');
  });

  it('trusted existing user: no createUser, establishes session, redirects to lesson', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([{ id: 'old-uid', email: 'old@x.com' }]);
    mockPrisma.lesson.findFirst.mockResolvedValue({ id: 'lesson-9' });
    mockAdmin.auth.verifyOtp.mockResolvedValue({ data: { session: { access_token: 'at', refresh_token: 'rt' } }, error: null });
    const exp = Math.floor(Date.now() / 1000) + 60;
    const sig = signEntry({ email: 'old@x.com', moduleCode: 'auto_bidder', exp });
    const res = await GET(req(`email=old@x.com&module_code=auto_bidder&exp=${exp}&sig=${sig}`));

    expect(mockAdmin.auth.admin.createUser).not.toHaveBeenCalled();
    expect(res.headers.get('location')).toBe('https://platform.test/mpstats-tools/lesson-9');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @mpstats/web test -- tests/partner/entry-route.test.ts`
Expected: FAIL — trusted tests fail (currently the signed request still falls through to the untrusted-new path, so `email_confirm` is `false` not `true`, and no session is established).

- [ ] **Step 3: Write the implementation**

Add a helper at the bottom of `route.ts` and wire the trusted branch where the `// --- Trusted branch: filled in Task 6 ---` marker sits:

```typescript
    if (trusted) {
      const userId = existingUser
        ? existingUser.id
        : await createPartnerUser(admin, email, name, /* confirmed */ true);
      if (!userId) return NextResponse.redirect(new URL('/login?error=partner_entry', origin));

      await prisma.userProfile.upsert({
        where: { id: userId },
        update: { ...(phone ? { phone } : {}) },
        create: { id: userId, name: name ?? null, phone: phone ?? null },
      }).catch((e) => Sentry.captureException(e, { tags: { area: 'partner-entry', stage: 'profile-upsert' } }));

      void firePartnerEntryLead(userId, { email, name, phone, moduleCode: moduleCode || undefined });
      return establishSession(admin, email, target, origin);
    }
```

Add these helpers (bottom of file):

```typescript
/** Creates a partner user; returns the new id or null on failure. */
async function createPartnerUser(
  admin: ReturnType<typeof getSupabaseAdmin>,
  email: string,
  name: string | undefined,
  confirmed: boolean,
): Promise<string | null> {
  const created = await admin.auth.admin.createUser({
    email,
    email_confirm: confirmed,
    user_metadata: { full_name: name ?? '' },
  });
  if (created.error || !created.data.user) {
    Sentry.captureException(created.error ?? new Error('createUser returned no user'), { tags: { area: 'partner-entry', stage: 'create-user' } });
    return null;
  }
  return created.data.user.id;
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
```

> Refactor the Task-5 untrusted-new path to reuse `createPartnerUser(admin, email, name, false)` instead of the inline `createUser` call, so user creation lives in one place (DRY). The existing test still passes — it asserts `email_confirm: false`, which `createPartnerUser(..., false)` preserves.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @mpstats/web test -- tests/partner/entry-route.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/api/partner/mpstats/enter/route.ts apps/web/tests/partner/entry-route.test.ts
git commit -m "feat(partner): trusted branch — instant server-side session"
```

---

## Task 7: Entry route — untrusted existing-user branches

Replaces the Task-5 placeholder. Two cases: (a) the request already carries a valid session for this email → straight redirect; (b) otherwise → email a magic link to the real owner → check-email page. A tampered signature must fall through to untrusted (no session created).

**Files:**
- Modify: `apps/web/src/app/api/partner/mpstats/enter/route.ts`
- Test: `apps/web/tests/partner/entry-route.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
  it('untrusted existing + already logged in as them: straight redirect to lesson', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([{ id: 'old-uid', email: 'old@x.com' }]);
    mockPrisma.lesson.findFirst.mockResolvedValue({ id: 'lesson-9' });
    mockServerSupabase.auth.getUser.mockResolvedValue({ data: { user: { email: 'old@x.com' } } });
    const res = await GET(req('email=old@x.com&module_code=auto_bidder'));
    expect(mockAdmin.auth.admin.generateLink).not.toHaveBeenCalled();
    expect(mockCq.sendPartnerMagicLinkEmail).not.toHaveBeenCalled();
    expect(res.headers.get('location')).toBe('https://platform.test/mpstats-tools/lesson-9');
  });

  it('untrusted existing + no/other session: emails magic link, redirects to check-email', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([{ id: 'old-uid', email: 'old@x.com' }]);
    mockServerSupabase.auth.getUser.mockResolvedValue({ data: { user: null } });
    const res = await GET(req('email=old@x.com'));
    expect(mockAdmin.auth.admin.createUser).not.toHaveBeenCalled();
    expect(mockCq.sendPartnerMagicLinkEmail).toHaveBeenCalledWith('old-uid', expect.objectContaining({
      link: expect.stringContaining('/auth/confirm?token_hash=tok123&type=magiclink'),
    }));
    expect(res.headers.get('location')).toContain('/partner/check-email');
  });

  it('tampered signature on existing user does NOT establish a session', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([{ id: 'old-uid', email: 'old@x.com' }]);
    mockServerSupabase.auth.getUser.mockResolvedValue({ data: { user: null } });
    const exp = Math.floor(Date.now() / 1000) + 60;
    const res = await GET(req(`email=old@x.com&exp=${exp}&sig=deadbeef`));
    expect(mockAdmin.auth.verifyOtp).not.toHaveBeenCalled(); // no trusted session mint
    expect(mockCq.sendPartnerMagicLinkEmail).toHaveBeenCalled(); // fell through to untrusted
    expect(res.headers.get('location')).toContain('/partner/check-email');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @mpstats/web test -- tests/partner/entry-route.test.ts`
Expected: FAIL — existing-user path still returns the `/login` placeholder.

- [ ] **Step 3: Write the implementation**

Replace the placeholder block:

```typescript
    if (existingUser) {
      return NextResponse.redirect(new URL('/login', origin)); // placeholder, replaced in Task 7
    }
```

with:

```typescript
    if (existingUser) {
      // Already authenticated as this exact user on this device → straight in.
      const server = await createClient();
      const { data: { user: sessionUser } } = await server.auth.getUser();
      if (sessionUser?.email && sessionUser.email.toLowerCase() === email.toLowerCase()) {
        return NextResponse.redirect(new URL(target, origin));
      }
      // Otherwise prove ownership via a magic link to the real inbox.
      void firePartnerEntryLead(existingUser.id, { email, name, phone, moduleCode: moduleCode || undefined });
      await emailMagicLink(admin, email, existingUser.id, target, origin);
      return NextResponse.redirect(new URL(`/partner/check-email?email=${encodeURIComponent(email)}`, origin));
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @mpstats/web test -- tests/partner/entry-route.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/api/partner/mpstats/enter/route.ts apps/web/tests/partner/entry-route.test.ts
git commit -m "feat(partner): untrusted existing-user branches (cookie reuse / magic link)"
```

---

## Task 8: Check-email landing page

**Files:**
- Create: `apps/web/src/app/partner/check-email/page.tsx`

- [ ] **Step 1: Write the page**

```tsx
// apps/web/src/app/partner/check-email/page.tsx
export const dynamic = 'force-dynamic';

export default function PartnerCheckEmailPage({
  searchParams,
}: {
  searchParams: { email?: string };
}) {
  const email = searchParams.email ?? '';
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-6 text-center">
      <h1 className="text-2xl font-semibold">Проверьте почту</h1>
      <p className="mt-3 text-muted-foreground">
        {email ? (
          <>Мы отправили ссылку для входа на <span className="font-medium">{email}</span>.</>
        ) : (
          <>Мы отправили ссылку для входа на вашу почту.</>
        )}{' '}
        Перейдите по ней, чтобы открыть бесплатный курс по инструментам MPSTATS.
      </p>
      <p className="mt-4 text-sm text-muted-foreground">
        Письма нет? Проверьте папку «Спам» или вернитесь и попробуйте ещё раз.
      </p>
    </main>
  );
}
```

> Check whether `/partner/*` needs to be added to public routes in `apps/web/src/middleware.ts` (auth gate). The page is outside `(main)`, but if middleware redirects unauthenticated users by default, add `/partner` to the public-path allowlist. Grep the middleware for the public-path list and mirror how `/login` / `/register` are whitelisted.

- [ ] **Step 2: Typecheck + build sanity**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/partner/check-email/page.tsx apps/web/src/middleware.ts
git commit -m "feat(partner): check-email landing page + public route"
```

---

## Task 9: Wrap-up — env docs + full test/typecheck

**Files:**
- Modify: `.env.example` (if present) and/or `docker-compose.yml` docs note

- [ ] **Step 1: Document the env var**

Add `MPSTATS_PARTNER_SIGNING_SECRET` to `.env.example` (grep the repo for an existing example env file; if none, add a one-line note to the spec's "Открытые вопросы"). Use a placeholder only — never a real secret:

```
# Shared HMAC secret for MPSTATS partner-entry signed links (Phase 2).
# When unset, the entry endpoint runs untrusted-only (magic-link path).
MPSTATS_PARTNER_SIGNING_SECRET=<your-shared-secret>
```

- [ ] **Step 2: Run the full web + api test suites**

Run: `pnpm --filter @mpstats/web test`
Expected: PASS (all existing + new partner tests).

Run: `pnpm --filter @mpstats/api test`
Expected: PASS (unchanged — no api package files touched).

- [ ] **Step 3: Typecheck the whole repo**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add .env.example
git commit -m "docs(partner): document MPSTATS_PARTNER_SIGNING_SECRET env var"
```

---

## Post-implementation (out of plan scope — coordinate, don't code)

1. **CQ automation rules** for `pa_partner_entry` (lead tagging) and `pa_partner_magic_link` (send the email containing the `pa_partner_magic_link` link prop). Without the magic-link rule, the untrusted path creates the session token but the user never receives it.
2. **Module mapping table** — agree the 24 MPSTATS codes ↔ our `partnerModuleKey` values with Igor; set `Lesson.metadata.partnerModuleKey` on the partner lessons (via Mgmt API, additive). Codes without a lesson fall back to the catalog automatically.
3. **HMAC secret** — share `MPSTATS_PARTNER_SIGNING_SECRET` with MPSTATS when they wire signing; set it in prod/staging env (`docker-compose.yml`). Until then untrusted-only.
4. **Deploy** — staging first (`--no-cache` build + content-check), then prod, behind the existing `PARTNER_COURSES_ENABLED` flag.

---

## Self-review notes

- **Spec coverage:** entry handler (§1) → Tasks 5-7; unified session primitive (§2) → `establishSession`/`emailMagicLink`; trust/signature (§3) → Task 2 + trusted branch; module resolve (§4) → Task 3; leads (§5) → `firePartnerEntryLead`; email delivery via CQ not the auth hook (§6) → Task 4 + `pa_partner_magic_link`; security — no auto-login without proof (§7) → untrusted branches + tampered-sig test; `PARTNER_COURSES_ENABLED` gate → Task 5; phone optional → upsert spreads phone only when present.
- **Open items** are explicitly post-plan (CQ rules, mapping, secret) — not silently dropped.
- **Type consistency:** `verifyPartnerSignature` / `partnerCanonicalString` / `resolvePartnerLessonId` / `firePartnerEntryLead` / `sendPartnerMagicLinkEmail` / `createPartnerUser` / `establishSession` / `emailMagicLink` used with identical signatures across tasks.
