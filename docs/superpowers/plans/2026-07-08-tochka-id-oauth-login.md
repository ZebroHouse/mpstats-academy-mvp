# Tochka ID OAuth Login — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Добавить вход/регистрацию «Войти через Точку» (Tochka ID OAuth), создающий Supabase-пользователя сразу подтверждённым — чтобы обойти проблему недоставки DOI-писем на `@tochka.com`.

**Architecture:** Кастомный OAuth-флоу, зеркалящий существующий Яндекс: server-action инициирует редирект в Точку → callback-роут обменивает код, тянет `user_info`, находит/создаёт Supabase-юзера и минтит сессию. OIDC-клиент Точки портируется из `go.mpstats.academy` (готовый обход Variti-WAF). Гейт — env-флаг `TOCHKA_LOGIN_ENABLED`.

**Tech Stack:** Next.js 14 App Router, TypeScript, Supabase Auth (Admin API), Prisma, Vitest. Спека: `docs/superpowers/specs/2026-07-08-tochka-id-oauth-login-design.md`.

**Эталонные файлы (читать перед началом):**
- `apps/web/src/app/api/auth/yandex/callback/route.ts` — эталон callback (find/create, magiclink-сессия, phone, trial/referral, CSRF).
- `apps/web/src/lib/auth/oauth-providers.ts` — интерфейс `OAuthProvider` + `YandexProvider`.
- `apps/web/src/lib/auth/actions.ts` (≈ строки 110–135) — server-action `signInWithYandex` (ставит state-куку + `redirect(authorizeUrl)`).
- `apps/web/src/lib/auth/supabase-admin.ts` — `getSupabaseAdmin()`.
- `apps/web/src/app/register/register-form.tsx` + `apps/web/src/app/register/page.tsx` — как страница-сервер отдаёт клиентской форме пропсы.
- `apps/web/src/app/login/page.tsx` — сейчас цельный `'use client'`; в Task 6 разбиваем.
- Источник порта: `D:/GpT_docs/go_mpstats_academy/lib/auth/tochka.ts`.

---

## File Structure

- **Create** `apps/web/src/lib/auth/tochka.ts` — низкоуровневый OIDC-клиент Точки (порт: `buildAuthorizeUrl`, `exchangeCodeForToken`, `fetchUserInfo`, `tochkaFetch` WAF-обёртка, `TochkaError`, типы). Одна ответственность: HTTP-общение с Точкой + обход WAF.
- **Modify** `apps/web/src/lib/auth/oauth-providers.ts` — добавить `TochkaProvider implements OAuthProvider` (адаптер над `tochka.ts`); расширить `OAuthUserInfo` опциональными `emailVerified?`/`phoneVerified?`.
- **Modify** `apps/web/src/lib/auth/actions.ts` — добавить server-action `signInWithTochka()` (зеркало `signInWithYandex`, + гейт флага).
- **Create** `apps/web/src/app/api/auth/tochka/callback/route.ts` — callback (зеркало Яндекса + ветка `tochka_no_email`).
- **Modify** `packages/db/prisma/schema.prisma` — `UserProfile.tochkaId String? @unique`.
- **Migration** — additive колонка `tochkaId` на прод-Supabase через Mgmt API.
- **Modify** `apps/web/src/app/register/register-form.tsx` + `.../register/page.tsx` — кнопка Точки, гейт пропом.
- **Create** `apps/web/src/app/login/login-form.tsx` + **Modify** `apps/web/src/app/login/page.tsx` — вынести клиент-форму, страница-сервер отдаёт флаг-проп + кнопку.
- **Create** `apps/web/src/components/auth/TochkaButton.tsx` — переиспользуемая кнопка (лого + текст, вызывает `signInWithTochka`).
- **Tests** `apps/web/src/lib/auth/__tests__/tochka.test.ts`, `apps/web/tests/auth/tochka-callback.test.ts`.
- **Modify** `.env.example` — новые переменные (без значений секретов).

---

## Task 1: DB — `UserProfile.tochkaId`

**Files:**
- Modify: `packages/db/prisma/schema.prisma` (модель `UserProfile`, рядом с `yandexId`)

- [ ] **Step 1: Добавить поле в схему**

В `model UserProfile` под строкой с `yandexId`:

```prisma
  tochkaId                String?   @unique // Tochka ID OAuth binding (2026-07)
```

- [ ] **Step 2: Сгенерировать Prisma-клиент, проверить компиляцию схемы**

Run: `cd "D:/GpT_docs/MPSTATS ACADEMY ADAPTIVE LEARNING/MAAL" && npx prisma@5.22.0 generate --schema packages/db/prisma/schema.prisma`
Expected: `Generated Prisma Client` без ошибок.

- [ ] **Step 3: Применить additive-миграцию к прод-Supabase через Mgmt API**

Следовать памяти `reference_supabase_migration_via_mgmt_api.md`. Только additive. Через `POST https://api.supabase.com/v1/projects/saecuecevicwjkpmaoot/database/query` (Bearer Mgmt-токен), Cyrillic не нужен → но используем `node -e fetch`:

```sql
ALTER TABLE "UserProfile" ADD COLUMN IF NOT EXISTS "tochkaId" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "UserProfile_tochkaId_key" ON "UserProfile"("tochkaId");
```

Проверка: `SELECT column_name FROM information_schema.columns WHERE table_name='UserProfile' AND column_name='tochkaId';` → 1 строка.
**ВНИМАНИЕ:** НЕ запускать `prisma migrate/db push` (localhost/скрипты смотрят на ПРОД-Supabase). Только этот ALTER.

- [ ] **Step 4: Commit**

```bash
git add packages/db/prisma/schema.prisma
git commit -m "feat(auth): add UserProfile.tochkaId for Tochka OAuth binding"
```

---

## Task 2: Порт OIDC-клиента Точки

**Files:**
- Create: `apps/web/src/lib/auth/tochka.ts`

- [ ] **Step 1: Скопировать клиент из go.mpstats**

Скопировать содержимое `D:/GpT_docs/go_mpstats_academy/lib/auth/tochka.ts` в `apps/web/src/lib/auth/tochka.ts` **целиком**, затем внести ровно два изменения (клиент go.mpstats использовал signed-state; нам нужен plain-state):

1. Удалить первую строку импорта:
```ts
import { signPayload, type OAuthStatePayload } from './session'
```
2. Заменить функцию `buildAuthorizeUrl` на версию с plain-string state:
```ts
/**
 * Build authorize URL. `state` — непрозрачная CSRF-строка (генерится в server-action,
 * сверяется в callback против одноимённой куки). Партнёрский контекст не тащим.
 */
export function buildAuthorizeUrl(state: string): string {
  const env = loadEnv()
  const params = new URLSearchParams({
    client_id: env.clientId,
    redirect_uri: env.redirectUri,
    response_type: 'code',
    // scope через запятую — квирк Точки (не по RFC 6749). openid для OIDC-claims,
    // customers для доступа к email/phone. Override — TOCHKA_SCOPE.
    scope: process.env.TOCHKA_SCOPE || 'openid,customers',
    state,
  })
  return `${env.ssoBaseUrl}/authorize?${params.toString()}`
}
```
Остальное (`tochkaFetch`, `exchangeCodeForToken`, `fetchUserInfo`, `TochkaError`, типы `TochkaTokenResponse`/`TochkaUserInfo`, `loadEnv`, константы WAF/timeout) — без изменений.

- [ ] **Step 2: Проверить типы**

Run: `cd apps/web && npx tsc --noEmit -p tsconfig.json 2>&1 | grep -i tochka` (из корня репо путь скорректировать)
Expected: нет ошибок по `lib/auth/tochka.ts` (в частности, нет висящего импорта `./session`).

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/auth/tochka.ts
git commit -m "feat(auth): port Tochka OIDC client from go.mpstats (plain-state)"
```

---

## Task 3: `TochkaProvider` адаптер

**Files:**
- Modify: `apps/web/src/lib/auth/oauth-providers.ts`
- Test: `apps/web/src/lib/auth/__tests__/tochka.test.ts`

- [ ] **Step 1: Написать падающий тест адаптера**

Create `apps/web/src/lib/auth/__tests__/tochka.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Мокаем низкоуровневый клиент, чтобы тестировать только адаптацию в OAuthUserInfo.
vi.mock('../tochka', () => ({
  buildAuthorizeUrl: (state: string) => `https://id.tochka.com/authorize?state=${state}`,
  exchangeCodeForToken: vi.fn(),
  fetchUserInfo: vi.fn(),
  TochkaError: class extends Error {},
}));

import { buildAuthorizeUrl, exchangeCodeForToken, fetchUserInfo } from '../tochka';
import { TochkaProvider } from '../oauth-providers';

describe('TochkaProvider', () => {
  beforeEach(() => vi.clearAllMocks());

  it('authorizeUrl passes state through to the client', () => {
    const url = new TochkaProvider().authorizeUrl('abc123');
    expect(url).toContain('state=abc123');
  });

  it('exchangeCode returns accessToken', async () => {
    (exchangeCodeForToken as any).mockResolvedValue({ access_token: 'tok', token_type: 'Bearer', expires_in: 3600 });
    const res = await new TochkaProvider().exchangeCode('code');
    expect(res.accessToken).toBe('tok');
  });

  it('getUserInfo maps Tochka user_info to OAuthUserInfo with lowercased email + verified flags', async () => {
    (fetchUserInfo as any).mockResolvedValue({
      sub: 'sub-1', email: 'Besov@Tochka.com', email_verified: true,
      phone_number: '+79990000000', phone_number_verified: true,
      given_name: 'Иван', family_name: 'Бесов', name: 'Иван Бесов',
    });
    const info = await new TochkaProvider().getUserInfo('tok');
    expect(info).toMatchObject({
      id: 'sub-1',
      email: 'besov@tochka.com',
      name: 'Иван Бесов',
      phone: '+79990000000',
      emailVerified: true,
      phoneVerified: true,
    });
  });

  it('getUserInfo tolerates missing email/phone', async () => {
    (fetchUserInfo as any).mockResolvedValue({ sub: 'sub-2' });
    const info = await new TochkaProvider().getUserInfo('tok');
    expect(info.email).toBeNull();
    expect(info.phone).toBeNull();
  });
});
```

- [ ] **Step 2: Запустить — убедиться, что падает**

Run: `cd "D:/GpT_docs/MPSTATS ACADEMY ADAPTIVE LEARNING/MAAL" && npx vitest run apps/web/src/lib/auth/__tests__/tochka.test.ts`
Expected: FAIL — `TochkaProvider` не экспортируется.

- [ ] **Step 3: Реализовать адаптер**

В `apps/web/src/lib/auth/oauth-providers.ts`: (а) расширить интерфейс `OAuthUserInfo`, (б) добавить класс. Импорт вверху файла:

```ts
import {
  buildAuthorizeUrl as tochkaAuthorizeUrl,
  exchangeCodeForToken as tochkaExchange,
  fetchUserInfo as tochkaUserInfo,
} from './tochka';
```

Расширить интерфейс (additive, необязательные поля — Yandex их не заполняет):

```ts
export interface OAuthUserInfo {
  id: string;
  email: string | null;
  name: string | null;
  phone: string | null;
  emailVerified?: boolean;
  phoneVerified?: boolean;
}
```

Добавить класс в конец файла:

```ts
export class TochkaProvider implements OAuthProvider {
  name = 'tochka';

  authorizeUrl(state: string): string {
    return tochkaAuthorizeUrl(state);
  }

  async exchangeCode(code: string): Promise<{ accessToken: string }> {
    const token = await tochkaExchange(code);
    return { accessToken: token.access_token };
  }

  async getUserInfo(accessToken: string): Promise<OAuthUserInfo> {
    const u = await tochkaUserInfo(accessToken);
    const name =
      u.name ||
      [u.given_name, u.family_name].filter(Boolean).join(' ') ||
      null;
    return {
      id: u.sub,
      // GoTrue хранит email в lowercase → нормализуем для сравнения в callback.
      email: u.email ? u.email.trim().toLowerCase() : null,
      name,
      phone: u.phone_number || null,
      emailVerified: u.email_verified,
      phoneVerified: u.phone_number_verified,
    };
  }
}
```

Примечание: `email` в `OAuthUserInfo` стал `string | null` — Яндекс всегда возвращает email, так что его код не ломается, но проверь, что TS не ругается на существующих потребителях (в callback Яндекса email используется — там он гарантирован).

- [ ] **Step 4: Запустить — убедиться, что проходит**

Run: `npx vitest run apps/web/src/lib/auth/__tests__/tochka.test.ts`
Expected: PASS (4 теста).

- [ ] **Step 5: Проверить, что тайп-чек всего web-пакета зелёный** (из-за смены `email` на `string | null`)

Run: `cd "D:/GpT_docs/MPSTATS ACADEMY ADAPTIVE LEARNING/MAAL" && pnpm --filter web typecheck` (или `npx tsc --noEmit` в `apps/web`)
Expected: 0 ошибок. Если Яндекс-callback ругается на `email: string | null` — сузить там через `if (!userInfo.email) { ... }` guard (у Яндекса email всегда есть, но TS требует явности).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/auth/oauth-providers.ts apps/web/src/lib/auth/__tests__/tochka.test.ts
git commit -m "feat(auth): TochkaProvider adapter over ported OIDC client"
```

---

## Task 4: Server-action `signInWithTochka`

**Files:**
- Modify: `apps/web/src/lib/auth/actions.ts`

- [ ] **Step 1: Прочитать эталон** `signInWithYandex` в `actions.ts` (≈ строки 110–135): как генерится `state`, ставится кука `yandex_oauth_state`, вызывается `redirect(provider.authorizeUrl(state))`.

- [ ] **Step 2: Добавить `signInWithTochka`**

Рядом с `signInWithYandex`, тем же стилем (импортировать `TochkaProvider` из `./oauth-providers`, `randomBytes`/`crypto` — как в Яндексе; `cookies`, `redirect` уже импортированы):

```ts
export async function signInWithTochka() {
  if (process.env.TOCHKA_LOGIN_ENABLED !== 'true') {
    return { error: 'Вход через Точку временно недоступен' };
  }
  const state = crypto.randomUUID(); // как генерит state Яндекс-экшен — использовать тот же способ
  const cookieStore = await cookies();
  cookieStore.set('tochka_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/api/auth/tochka',
    maxAge: 600, // 10 мин
  });
  const provider = new TochkaProvider();
  redirect(provider.authorizeUrl(state));
}
```

Примечание: способ генерации `state` и опции куки взять идентичными `signInWithYandex` (если там `randomBytes(16).toString('hex')` — использовать его, а не `randomUUID`, ради единообразия). `redirect()` бросает `NEXT_REDIRECT` — это норма, не оборачивать в try/catch.

- [ ] **Step 3: Тайп-чек**

Run: `pnpm --filter web typecheck`
Expected: 0 ошибок.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/lib/auth/actions.ts
git commit -m "feat(auth): signInWithTochka server action (flag-gated)"
```

---

## Task 5: Callback-роут

**Files:**
- Create: `apps/web/src/app/api/auth/tochka/callback/route.ts`
- Test: `apps/web/tests/auth/tochka-callback.test.ts`

- [ ] **Step 1: Прочитать эталон** `apps/web/src/app/api/auth/yandex/callback/route.ts` целиком — новый роут копирует его 1:1 с отличиями ниже.

- [ ] **Step 2: Написать падающий тест логики callback**

Create `apps/web/tests/auth/tochka-callback.test.ts`, зеркаля мок-харнес из `apps/web/tests/auth/yandex-oauth.test.ts` (открыть его и повторить способ мокинга `TochkaProvider`, `getSupabaseAdmin`, `prisma`). Кейсы:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
// ВАЖНО: структуру моков (vi.mock путей) скопировать из yandex-oauth.test.ts —
// там уже налажены моки next/headers cookies, supabase-admin, prisma, sentry.

describe('Tochka callback', () => {
  beforeEach(() => { process.env.TOCHKA_LOGIN_ENABLED = 'true'; vi.clearAllMocks(); });

  it('редиректит на /login?error=invalid_state при несовпадении state', async () => {
    // cookie tochka_oauth_state = 'A', query state = 'B' → invalid_state
    // ожидание: Response.redirect location содержит 'error=invalid_state'
  });

  it('редиректит на /login?error=tochka_no_email когда user_info без email', async () => {
    // provider.getUserInfo → { id:'s', email:null, phone:'+7', name:null }
    // ожидание: location содержит 'error=tochka_no_email', createUser НЕ вызван
  });

  it('существующий email → логин без createUser (линк)', async () => {
    // prisma.$queryRaw → [{ id:'u1', email:'x@tochka.com' }]
    // ожидание: admin.createUser НЕ вызван; generateLink+verifyOtp вызваны; редирект /dashboard
  });

  it('новый email → createUser({email_confirm:true}) + ensureBaseTrial + редирект', async () => {
    // prisma.$queryRaw → []
    // ожидание: createUser вызван с email_confirm:true и user_metadata.tochka_id; ensureBaseTrial вызван
  });

  it('новый без телефона → редирект /complete-profile', async () => {
    // getUserInfo.phone=null, новый юзер → location содержит /complete-profile
  });

  it('флаг off → тихий редирект /login', async () => {
    process.env.TOCHKA_LOGIN_ENABLED = 'false';
    // ожидание: редирект на /login, обмен кода НЕ начат
  });
});
```

Заполнить тела кейсов по образцу `yandex-oauth.test.ts` (там показан способ импортировать `GET` роута и ассертить `Response`). Моки провайдера: `vi.mock('@/lib/auth/oauth-providers', ...)` с `TochkaProvider` возвращающим фикстуры.

- [ ] **Step 3: Запустить — убедиться, что падает**

Run: `npx vitest run apps/web/tests/auth/tochka-callback.test.ts`
Expected: FAIL — роут не существует.

- [ ] **Step 4: Реализовать callback**

Create `apps/web/src/app/api/auth/tochka/callback/route.ts`. Взять Яндекс-callback за основу; отличия:
- Провайдер: `new TochkaProvider()` вместо `YandexProvider`.
- Кука состояния: `tochka_oauth_state`.
- В самом начале `GET`: `if (process.env.TOCHKA_LOGIN_ENABLED !== 'true') return NextResponse.redirect(new URL('/login', siteUrl));`
- После `getUserInfo`: **если `!userInfo.email` → `return NextResponse.redirect(new URL('/login?error=tochka_no_email', siteUrl));`** (до поиска/создания).
- `createUser.user_metadata`: `{ full_name: userInfo.name, tochka_id: userInfo.id, tochka_email_verified: userInfo.emailVerified ?? null, tochka_phone_verified: userInfo.phoneVerified ?? null }`.
- Бэкафилл существующему: `user_metadata: { tochka_id: userInfo.id, full_name: userInfo.name }`.
- `UserProfile.upsert`: `tochkaId: userInfo.id` (+ `phone` если есть) вместо `yandexId`.
- Sentry-теги: `route: 'tochka-callback'`.
- Всё остальное (raw SQL lookup по `lower(email)`, `generateLink`+`verifyOtp`, `setSession` через `createServerClient`, `ensureBaseTrial`/`issueReferralOnSignup` для новых, `needsPhone → /complete-profile`, ошибки → `/login?error=auth_callback_error`) — идентично Яндексу.

Полный код (скелет — заполнить импорты/детали строго по Яндекс-эталону):

```ts
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import * as Sentry from '@sentry/nextjs';
import { prisma } from '@mpstats/db/client';
import { TochkaProvider } from '@/lib/auth/oauth-providers';
import { getSupabaseAdmin } from '@/lib/auth/supabase-admin';
import { REFERRAL_COOKIE_NAME, isValidRefCodeShape } from '@/lib/referral/attribution';
import { issueReferralOnSignup } from '@/lib/referral/issue';
import { ensureBaseTrial } from '@mpstats/api';

export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
  if (process.env.TOCHKA_LOGIN_ENABLED !== 'true') {
    return NextResponse.redirect(new URL('/login', siteUrl));
  }
  try {
    const url = new URL(request.url);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    if (!code) return NextResponse.redirect(new URL('/login?error=missing_code', siteUrl));

    const cookieStore = await cookies();
    const storedState = cookieStore.get('tochka_oauth_state')?.value;
    if (!storedState || storedState !== state) {
      return NextResponse.redirect(new URL('/login?error=invalid_state', siteUrl));
    }
    cookieStore.delete('tochka_oauth_state');

    const provider = new TochkaProvider();
    const { accessToken } = await provider.exchangeCode(code);
    const userInfo = await provider.getUserInfo(accessToken);

    if (!userInfo.email) {
      return NextResponse.redirect(new URL('/login?error=tochka_no_email', siteUrl));
    }

    const admin = getSupabaseAdmin();
    const existingRows = await prisma.$queryRaw<Array<{ id: string; email: string }>>`
      SELECT id::text AS id, email FROM auth.users
      WHERE lower(email) = lower(${userInfo.email}) LIMIT 1
    `;
    const isNewUser = existingRows.length === 0;

    let supabaseUserId: string;
    let supabaseUserEmail: string;

    if (!isNewUser) {
      supabaseUserId = existingRows[0].id;
      supabaseUserEmail = existingRows[0].email;
      void admin.auth.admin.updateUserById(supabaseUserId, {
        user_metadata: { tochka_id: userInfo.id, full_name: userInfo.name },
      }).then(({ error }) => { if (error) Sentry.captureException(error, { tags: { route: 'tochka-callback', stage: 'backfill-tochka-id' } }); });
    } else {
      const { data: createData, error: createError } = await admin.auth.admin.createUser({
        email: userInfo.email,
        email_confirm: true,
        user_metadata: {
          full_name: userInfo.name,
          tochka_id: userInfo.id,
          tochka_email_verified: userInfo.emailVerified ?? null,
          tochka_phone_verified: userInfo.phoneVerified ?? null,
        },
      });
      if (createError || !createData.user) {
        Sentry.captureException(createError ?? new Error('createUser returned no user'), { tags: { route: 'tochka-callback', stage: 'create-user' } });
        return NextResponse.redirect(new URL('/login?error=auth_callback_error', siteUrl));
      }
      supabaseUserId = createData.user.id;
      supabaseUserEmail = createData.user.email!;
    }

    const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({ type: 'magiclink', email: supabaseUserEmail });
    if (linkError || !linkData) {
      Sentry.captureException(linkError ?? new Error('generateLink returned no data'), { tags: { route: 'tochka-callback', stage: 'generate-link' } });
      return NextResponse.redirect(new URL('/login?error=auth_callback_error', siteUrl));
    }
    const { data: otpData, error: otpError } = await admin.auth.verifyOtp({ token_hash: linkData.properties.hashed_token, type: 'magiclink' });
    if (otpError || !otpData.session) {
      Sentry.captureException(otpError ?? new Error('verifyOtp returned no session'), { tags: { route: 'tochka-callback', stage: 'verify-otp' } });
      return NextResponse.redirect(new URL('/login?error=auth_callback_error', siteUrl));
    }

    let profilePhone: string | null = null;
    try {
      const upserted = await prisma.userProfile.upsert({
        where: { id: supabaseUserId },
        update: { tochkaId: userInfo.id, ...(userInfo.phone ? { phone: userInfo.phone } : {}) },
        create: { id: supabaseUserId, name: userInfo.name, tochkaId: userInfo.id, phone: userInfo.phone },
      });
      profilePhone = upserted.phone;
    } catch (prismaError) {
      console.error('Failed to update tochkaId:', prismaError);
    }

    const needsPhone = isNewUser && !profilePhone;
    const response = NextResponse.redirect(new URL(needsPhone ? '/complete-profile' : '/dashboard', siteUrl));

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      { cookies: { getAll() { return []; }, setAll(list: { name: string; value: string; options: Record<string, unknown> }[]) { list.forEach(({ name, value, options }) => response.cookies.set(name, value, options)); } } },
    );
    await supabase.auth.setSession({ access_token: otpData.session.access_token, refresh_token: otpData.session.refresh_token });

    if (isNewUser) {
      const refCookie = cookieStore.get(REFERRAL_COOKIE_NAME)?.value;
      const refCode = refCookie && isValidRefCodeShape(refCookie) ? refCookie : null;
      if (refCode) {
        issueReferralOnSignup({ refCode, friendUserId: supabaseUserId }).catch((err) => console.error('[TochkaCallback] referral issue failed:', err));
        response.cookies.delete(REFERRAL_COOKIE_NAME);
      } else {
        await ensureBaseTrial(supabaseUserId);
      }
    }
    return response;
  } catch (error) {
    Sentry.captureException(error, { tags: { route: 'tochka-callback', stage: 'unhandled' } });
    return NextResponse.redirect(new URL('/login?error=auth_callback_error', siteUrl));
  }
}
```

- [ ] **Step 5: Запустить тесты — зелёные**

Run: `npx vitest run apps/web/tests/auth/tochka-callback.test.ts`
Expected: PASS (все кейсы).

- [ ] **Step 6: Тайп-чек**

Run: `pnpm --filter web typecheck`
Expected: 0 ошибок.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/app/api/auth/tochka/callback/route.ts apps/web/tests/auth/tochka-callback.test.ts
git commit -m "feat(auth): Tochka OAuth callback route (mirror Yandex, pre-confirmed users)"
```

---

## Task 6: UI — кнопка «Войти через Точку»

**Files:**
- Create: `apps/web/src/components/auth/TochkaButton.tsx`
- Modify: `apps/web/src/app/register/register-form.tsx`, `apps/web/src/app/register/page.tsx`
- Create: `apps/web/src/app/login/login-form.tsx`; Modify: `apps/web/src/app/login/page.tsx`

- [ ] **Step 1: Кнопка**

Create `apps/web/src/components/auth/TochkaButton.tsx`:

```tsx
'use client';

import { Button } from '@/components/ui/button';
import { signInWithTochka } from '@/lib/auth/actions';

export function TochkaButton({ disabled }: { disabled?: boolean }) {
  async function handle() {
    await signInWithTochka(); // сервер-редиректит в Точку; при флаге off вернёт {error}
  }
  return (
    <Button type="button" variant="outline" className="w-full" disabled={disabled} onClick={handle}>
      {/* TODO-ассет: заменить на SVG-лого Точки из brand-assets, когда пришлют */}
      Войти через Точку
    </Button>
  );
}
```

Примечание по логотипу: до получения SVG — текстовая кнопка. Логотип Точки взять из `go_mpstats_academy/brand-assets` или у Кары; когда будет — вставить `<img>`/inline-SVG слева от текста.

- [ ] **Step 2: Register — прокинуть флаг и показать кнопку**

В `apps/web/src/app/register/page.tsx` (server-компонент, рендерит `<RegisterForm/>`): прочитать флаг и передать пропом:
```tsx
const tochkaEnabled = process.env.TOCHKA_LOGIN_ENABLED === 'true';
// ...
<RegisterForm /* существующие пропсы */ tochkaEnabled={tochkaEnabled} />
```
В `register-form.tsx`: добавить в тип пропсов `tochkaEnabled?: boolean;` и рядом с существующей кнопкой Яндекса отрендерить `{tochkaEnabled && <TochkaButton />}` (импортировать `TochkaButton`).

- [ ] **Step 3: Login — вынести клиент-форму, прокинуть флаг**

Сейчас `apps/web/src/app/login/page.tsx` — цельный `'use client'`. Разбить:
1. Переместить весь текущий контент (компонент `LoginForm` + дефолтный экспорт-обёртка `Suspense`) в новый файл `apps/web/src/app/login/login-form.tsx`, добавив в начало `'use client';`. Экспортировать как `export function LoginPageClient({ tochkaEnabled }: { tochkaEnabled?: boolean })` (проброс пропа в внутренний `LoginForm`).
2. Новый `apps/web/src/app/login/page.tsx` — **server-компонент** (без `'use client'`):
```tsx
import { LoginPageClient } from './login-form';

export default function LoginPage() {
  const tochkaEnabled = process.env.TOCHKA_LOGIN_ENABLED === 'true';
  return <LoginPageClient tochkaEnabled={tochkaEnabled} />;
}
```
3. В `login-form.tsx` рядом с `handleYandexSignIn`-кнопкой отрендерить `{tochkaEnabled && <TochkaButton disabled={loading} />}`.

**ВНИМАНИЕ (gotcha из памяти Phase 65):** после перемещения файлов удалить устаревшие типы Next: `apps/web/.next/types/app/login/*` могут ломать `tsc` (TS2307) — снести `.next` или стейл-типы перед тайп-чеком.

- [ ] **Step 4: Тайп-чек + существующие тесты login/register не падают**

Run: `cd "D:/GpT_docs/MPSTATS ACADEMY ADAPTIVE LEARNING/MAAL" && pnpm --filter web typecheck && npx vitest run apps/web/tests/unit/welcome-page.test.tsx apps/web/tests/auth`
Expected: typecheck 0 ошибок; тесты зелёные (кроме известного флейка `yandex-oauth` под нагрузкой — если падает только он, ок).

- [ ] **Step 5: Локальная проверка рендера** (dev читает ПРОД-Supabase — только смотрим верстку, не логинимся)

Run: `TOCHKA_LOGIN_ENABLED=true pnpm --filter web dev` → открыть `/login` и `/register` → кнопка «Войти через Точку» видна; при `TOCHKA_LOGIN_ENABLED` не заданном — скрыта.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/auth/TochkaButton.tsx apps/web/src/app/register/register-form.tsx apps/web/src/app/register/page.tsx apps/web/src/app/login/login-form.tsx apps/web/src/app/login/page.tsx
git commit -m "feat(auth): «Войти через Точку» button on /login and /register (flag-gated)"
```

---

## Task 7: Env + документация

**Files:**
- Modify: `apps/web/.env.example` (или корневой `.env.example`, где живут YANDEX_*)

- [ ] **Step 1: Добавить переменные в `.env.example`** (плейсхолдеры, без реальных значений)

```
# Tochka ID OAuth (2026-07) — общий клиент с go.mpstats
TOCHKA_CLIENT_ID=
TOCHKA_CLIENT_SECRET=
TOCHKA_REDIRECT_URI=https://platform.mpstats.academy/api/auth/tochka/callback
TOCHKA_LOGIN_ENABLED=false
# TOCHKA_SSO_BASE_URL=  # default https://id.tochka.com/api/v1/tochka-id/auth/v1/sso
# TOCHKA_SCOPE=         # default openid,customers
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/.env.example
git commit -m "chore(auth): document Tochka OAuth env vars"
```

**Реальные значения (НЕ в git — только в рантайм-env):** `TOCHKA_CLIENT_ID=245da9d0f5564ac8aca0a3528f720078`, `TOCHKA_CLIENT_SECRET` = скопировать из прод-env go.mpstats (тот же клиент). Прописываются в `.env`/`docker-compose.yml` на VPS при деплое (см. runbook ниже).

---

## Deployment runbook (после мержа фичи)

1. Прод-БД: миграция `tochkaId` уже применена (Task 1, Step 3) — проверить, что колонка есть.
2. В прод `docker-compose.yml` / `.env.production` добавить `TOCHKA_CLIENT_ID`, `TOCHKA_CLIENT_SECRET`, `TOCHKA_REDIRECT_URI` и `TOCHKA_LOGIN_ENABLED=false` (ship dark).
3. Прод-деплой: `build --no-cache web` + recreate (см. `.claude/memory/staging-workflow.md` + `deploy-details.md`). Smoke: `/login` 200, кнопка НЕ видна (флаг off).
4. Staging: те же креды + `TOCHKA_LOGIN_ENABLED=true` → E2E: вход реальным Tochka ID (новый → создан подтверждённым, телефон; существующий email → линк).
5. Go-live: в прод-compose `TOCHKA_LOGIN_ENABLED=true` + `up -d web` (runtime, без пересборки). Проверить живой вход.
6. **Откат:** `TOCHKA_LOGIN_ENABLED=false` + `up -d web` (мгновенно), либо `git revert` мержа + редеплой.

---

## Self-Review (заполняется при написании; проверка покрытия спеки)

- Спека §«OIDC-клиент» → Task 2. §«Роуты» → Task 4 (authorize через server-action) + Task 5 (callback). §«UI» → Task 6. §«Схема» → Task 1. §«Env» → Task 7 + runbook. §«Обработка ошибок» → Task 5 (коды). §«Тесты» → Tasks 3, 5 (+ Task 6 регресс). §«Роллаут» → runbook.
- Решение «связывание всегда по email» → Task 5 (нет гейта на emailVerified, только запись в метаданные). «Нет email → /login» → Task 5 Step 4. «Флаг» → Tasks 4/5/6 + runbook.
- Отклонение от спеки: authorize реализован как **server-action** `signInWithTochka` (Task 4), а не как `/api/auth/tochka/authorize` роут — так требует консистентность с Яндексом (у него тоже нет authorize-роута). Функционально эквивалентно.
```
