# MPSTATS Tools Partner Course — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Разместить бесплатный курс «Инструменты MPSTATS» как изолированный брендированный раздел `/mpstats-tools` (паттерн «партнёрский курс»), с каталогом, плеером, deep-link `?module=`, бесплатным доступом и изоляцией от диагностики/трека/job-каталога — при сохранении уроков в общем AI-поиске и RAG.

**Architecture:** Один новый nullable столбец `Course.partnerKey` служит и меткой изоляции, и признаком брендирования. Партнёрские уроки — обычные `Lesson` под одним Course (`mpstats_tools`), сгруппированные в каталоге по `metadata.toolGroup`, deep-link по `metadata.partnerModuleKey`. Бесплатный доступ — bypass в `isLessonAccessible` по `partnerKey`. Изоляция — фильтр `course: { partnerKey: null }` в диагностике/треке/каталоге курсов; `searchLessons` НЕ фильтруется (уроки остаются в общем поиске). Раздел живёт под `(main)` и переиспускает существующие компоненты (KinescopePlayer, ai.chat, learning.saveWatchProgress).

**Tech Stack:** Next.js 14 App Router, tRPC, Prisma + Supabase (Postgres), Vitest, Tailwind.

**Spec:** `docs/superpowers/specs/2026-06-05-mpstats-tools-partner-course-design.md`

**Out of scope (явно):** бесшовная авторизация (Часть 2, отдельный спек); транскрибация/ingestion (отдельный пайплайн); реальные Kinescope videoId (заполняются владельцем в манифесте по мере загрузки видео); админка управления партнёрами; Точка Банк.

---

## КРИТИЧЕСКИЕ ИНВАРИАНТЫ (не нарушать)

1. **Бесплатность вешаем на `partnerKey != null`, НЕ на `isFree`.** `Course.isFree` имеет `@default(true)` и нигде не читается — завязка на него откроет ВСЕ платные курсы.
2. **`searchLessons` НЕ фильтруем по partnerKey** — партнёрские уроки должны оставаться в общем AI-поиске (требование заказчика «изолирован + общий AI-поиск»).
3. **Партнёрские уроки НЕ получают `JobLesson`-связей и `skillBlocks=null`** — иначе протекут в job-каталог/playbooks.
4. **Изоляция диагностики/трека — по `course: { partnerKey: null }`**, добавить во ВСЕ соответствующие `prisma.lesson.findMany`.
5. **DDL на prod** — только аддитивно, через Supabase Management API (см. `reference_supabase_migration_via_mgmt_api.md`). Никогда `prisma db push` на prod.

---

## File Structure

**Создаём:**
- `apps/web/src/app/(main)/mpstats-tools/page.tsx` — каталог + резолв deep-link
- `apps/web/src/app/(main)/mpstats-tools/[lessonId]/page.tsx` — плеер урока
- `apps/web/src/components/mpstats-tools/ToolsCatalog.tsx` — client-компонент каталога
- `apps/web/src/components/mpstats-tools/PartnerLessonView.tsx` — client-компонент плеера (переиспускает KinescopePlayer + ai.chat + progress)
- `packages/api/src/routers/partner.ts` — tRPC роутер партнёрского курса
- `packages/api/src/routers/__tests__/partner.test.ts` — тесты роутера
- `packages/api/src/utils/__tests__/access-partner.test.ts` — тесты bypass доступа
- `scripts/seed/seed-mpstats-tools.ts` — сид Course + уроков из манифеста
- `scripts/seed/mpstats-tools-manifest.json` — манифест курса (титры/группы/ключи; videoId заполняет владелец)
- `packages/db/prisma/migrations/<ts>_add_course_partner_key/migration.sql` — аддитивная миграция

**Модифицируем:**
- `packages/db/prisma/schema.prisma` — `Course.partnerKey String?` + индекс
- `packages/api/src/utils/access.ts` — bypass по `isPartnerFree`
- `packages/api/src/routers/ai.ts` — searchLessons: select `partnerKey`, передать `isPartnerFree`, вернуть routing-hint
- `packages/api/src/routers/diagnostic.ts` — 4 запроса: `course: { partnerKey: null }`
- `packages/api/src/routers/learning.ts` — getPath(×2), getRecommendedPath(×2), getCourses/getCourse: `partnerKey: null`
- `packages/api/src/server.ts` (или root router) — подключить `partnerRouter`
- `apps/web/src/components/shared/sidebar.tsx` + `mobile-nav.tsx` — пункт «Инструменты MPSTATS» с зелёной иконкой
- `apps/web/src/components/learning/AgentSearch.tsx` (или место рендера результатов searchLessons) — роутинг партнёрских результатов на `/mpstats-tools/[id]`

---

## Task 1: Schema — `Course.partnerKey`

**Files:**
- Modify: `packages/db/prisma/schema.prisma` (model `Course`, ~line 127-147)
- Create: `packages/db/prisma/migrations/<timestamp>_add_course_partner_key/migration.sql`

- [ ] **Step 1: Add field to schema**

В `model Course`, после `isHidden`/`hiddenAt` блока добавить:

```prisma
  partnerKey  String?   // null = обычный академический курс; 'mpstats' = партнёрский (бесплатный, изолированный)
```

И в конце модели, рядом с `@@index([isHidden])`:

```prisma
  @@index([partnerKey])
```

- [ ] **Step 2: Generate Prisma client**

Run: `pnpm db:generate`
Expected: успешная генерация, тип `Course` теперь имеет `partnerKey: string | null`.

- [ ] **Step 3: Create migration SQL file**

Создать `packages/db/prisma/migrations/<timestamp>_add_course_partner_key/migration.sql` (timestamp формата `YYYYMMDDHHMMSS`, напр. `20260605120000`):

```sql
-- AlterTable
ALTER TABLE "Course" ADD COLUMN "partnerKey" TEXT;

-- CreateIndex
CREATE INDEX "Course_partnerKey_idx" ON "Course"("partnerKey");
```

- [ ] **Step 4: Apply to dev DB**

Run: `pnpm db:generate` (уже) + применить миграцию к dev/staging БД согласно процессу проекта (НЕ `db push` на prod). Для локальной dev-БД: `npx prisma@5.22.0 migrate deploy`.
Expected: столбец создан, существующие строки `Course.partnerKey = NULL`.

- [ ] **Step 5: Commit**

```bash
git add packages/db/prisma/schema.prisma packages/db/prisma/migrations
git commit -m "feat(62): add Course.partnerKey for partner-course isolation"
```

> **Prod-деплой миграции** — отдельный шаг рантайма (Task 12), через Mgmt API.

---

## Task 2: Access bypass для партнёрских курсов

**Files:**
- Modify: `packages/api/src/utils/access.ts` (`isLessonAccessible` ~line 49-61, `checkLessonAccess` ~line 81-117)
- Test: `packages/api/src/utils/__tests__/access-partner.test.ts`

- [ ] **Step 1: Write failing test**

Создать `packages/api/src/utils/__tests__/access-partner.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { isLessonAccessible } from '../access';

describe('isLessonAccessible — partner free bypass', () => {
  const noSubs: never[] = [];

  it('партнёрский урок (isPartnerFree) доступен даже при order>2 без подписки', () => {
    expect(
      isLessonAccessible(
        { order: 9, courseId: 'mpstats_tools', isPartnerFree: true },
        noSubs,
        /* billingEnabled */ true,
        /* isAdminBypass */ false,
      ),
    ).toBe(true);
  });

  it('обычный платный урок (order>2, isPartnerFree=undefined) недоступен без подписки', () => {
    expect(
      isLessonAccessible(
        { order: 9, courseId: '01_analytics' },
        noSubs,
        true,
        false,
      ),
    ).toBe(false);
  });

  it('обычный free-lesson (order<=2) по-прежнему доступен', () => {
    expect(
      isLessonAccessible({ order: 1, courseId: '01_analytics' }, noSubs, true, false),
    ).toBe(true);
  });
});
```

- [ ] **Step 2: Run test — verify FAIL**

Run: `pnpm --filter @mpstats/api test access-partner`
Expected: FAIL — первый кейс возвращает `false` (bypass ещё не реализован).

- [ ] **Step 3: Implement bypass in `isLessonAccessible`**

В `packages/api/src/utils/access.ts` изменить сигнатуру и тело:

```typescript
export function isLessonAccessible(
  lesson: { order: number; courseId: string; isPartnerFree?: boolean },
  subscriptions: SubscriptionWithPlan[],
  billingEnabled: boolean,
  isAdminBypass = false,
): boolean {
  if (!billingEnabled) return true;
  if (isAdminBypass) return true;
  if (lesson.isPartnerFree) return true; // партнёрский курс — полностью бесплатный
  if (lesson.order <= FREE_LESSON_THRESHOLD) return true;
  if (subscriptions.some((s) => s.plan.type === 'PLATFORM')) return true;
  if (subscriptions.some((s) => s.plan.type === 'COURSE' && s.courseId === lesson.courseId)) return true;
  return false;
}
```

- [ ] **Step 4: Mirror in `checkLessonAccess` (symmetry для material-доступа)**

Изменить сигнатуру и добавить ранний возврат после admin-bypass:

```typescript
export async function checkLessonAccess(
  userId: string,
  lesson: { order: number; courseId: string; isPartnerFree?: boolean },
  prisma: PrismaClient,
): Promise<AccessResult> {
  const billingEnabled = await isFeatureEnabled('billing_enabled');
  if (!billingEnabled) {
    return { hasAccess: true, reason: 'billing_disabled', hasPlatformSubscription: false };
  }
  const userProfile = await prisma.userProfile.findUnique({
    where: { id: userId },
    select: { role: true },
  });
  if (userProfile?.role === 'ADMIN' || userProfile?.role === 'SUPERADMIN') {
    return { hasAccess: true, reason: 'admin_bypass', hasPlatformSubscription: false };
  }
  if (lesson.isPartnerFree) {
    return { hasAccess: true, reason: 'free_lesson', hasPlatformSubscription: false };
  }
  // ...остальное без изменений (subscriptions, order<=threshold, ...)
```

(Остальная часть функции — без изменений.)

- [ ] **Step 5: Run test — verify PASS**

Run: `pnpm --filter @mpstats/api test access-partner`
Expected: PASS (3/3).

- [ ] **Step 6: Commit**

```bash
git add packages/api/src/utils/access.ts packages/api/src/utils/__tests__/access-partner.test.ts
git commit -m "feat(62): partner-course free access bypass in access utils"
```

---

## Task 3: Изоляция диагностики и трека (фильтр partnerKey: null)

**Files:**
- Modify: `packages/api/src/routers/diagnostic.ts` (queries @ ~61, ~217, ~273, ~315)
- Modify: `packages/api/src/routers/learning.ts` (queries @ ~194, ~234, ~372, ~416; getCourses/getCourse course-queries)

> Тестируем через assert на аргументы вызова prisma (call-arg), т.к. это внутренние выборки.

- [ ] **Step 1: Write failing test (diagnostic excludes partner)**

Добавить в `packages/api/src/routers/__tests__/` файл `diagnostic-partner-isolation.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { generateFullRecommendedPath } from '../diagnostic';

// generateFullRecommendedPath(prisma, skillProfile-like) — проверяем where включает course.partnerKey: null
describe('diagnostic — partner isolation', () => {
  it('выборка уроков по категории фильтрует course.partnerKey: null', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const prisma = { lesson: { findMany } } as any;
    // минимальный gaps-вход: одна категория
    await generateFullRecommendedPath(prisma, [{ category: 'ANALYTICS', score: 10 }] as any);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ course: { isHidden: false, partnerKey: null } }),
      }),
    );
  });
});
```

> Если `generateFullRecommendedPath` не экспортирован — экспортировать его (`export`) в diagnostic.ts. Если его сигнатура отличается — адаптировать вызов под реальную (см. файл), сохранив суть проверки.

- [ ] **Step 2: Run — verify FAIL**

Run: `pnpm --filter @mpstats/api test diagnostic-partner-isolation`
Expected: FAIL — where сейчас `{ skillCategory, isHidden: false, course: { isHidden: false } }`.

- [ ] **Step 3: Patch diagnostic.ts (4 запроса)**

В каждом из 4 `prisma.lesson.findMany` заменить `course: { isHidden: false }` на `course: { isHidden: false, partnerKey: null }`:

- ~line 61 (`getLessonsByCategory`)
- ~line 217 (`generateFullRecommendedPath`)
- ~line 273 (`generateSectionedPath` — error section)
- ~line 315 (`generateSectionedPath` — all lessons)

Пример (line 315):

```typescript
const allLessons = await prisma.lesson.findMany({
  where: { isHidden: false, course: { isHidden: false, partnerKey: null } },
  select: { id: true, skillCategory: true, skillCategories: true, skillLevel: true, order: true },
  orderBy: { order: 'asc' },
});
```

- [ ] **Step 4: Run — verify PASS**

Run: `pnpm --filter @mpstats/api test diagnostic-partner-isolation`
Expected: PASS.

- [ ] **Step 5: Patch learning.ts (track + course catalog)**

В `learning.ts` добавить `partnerKey: null` в `course`-фильтр следующих выборок:
- `getPath` без пути (~194): `where: { isHidden: false, course: { isHidden: false, partnerKey: null } }`
- `getPath` с путём (~234): то же
- `getRecommendedPath` sectioned (~372): добавить `partnerKey: null` в `course` внутри `where`
- `getRecommendedPath` flat (~416): то же

И в каталоге курсов (getCourses / getCourse) — там, где выбираются курсы (`prisma.course.findMany` / `findUnique`), добавить `partnerKey: null` в where, чтобы партнёрский курс не появлялся в обычном каталоге «Все курсы». Найти эти запросы (grep `prisma.course.find` в learning.ts) и добавить фильтр в `findMany` where; для `getCourse(courseId)` — добавить проверку `partnerKey: null` (вернуть null, если курс партнёрский).

- [ ] **Step 6: Run full api tests — no regressions**

Run: `pnpm --filter @mpstats/api test`
Expected: все зелёные (включая существующие diagnostic/learning тесты).

- [ ] **Step 7: Commit**

```bash
git add packages/api/src/routers/diagnostic.ts packages/api/src/routers/learning.ts packages/api/src/routers/__tests__/diagnostic-partner-isolation.test.ts
git commit -m "feat(62): exclude partner courses from diagnostic, track and course catalog"
```

---

## Task 4: searchLessons — партнёрские уроки остаются в поиске, но корректный доступ и routing

**Files:**
- Modify: `packages/api/src/routers/ai.ts` (`searchLessons` ~213-379; enrichment query ~280-293; access call ~330)

- [ ] **Step 1: Write failing test**

Добавить `packages/api/src/routers/__tests__/ai-searchLessons-partner.test.ts`. Цель: партнёрский урок (course.partnerKey='mpstats', order>2, нет подписки) в результатах помечен `locked: false` и имеет routing-признак `isPartner: true`.

```typescript
import { describe, it, expect, vi } from 'vitest';
// импорт/мок по образцу существующего ai-searchLessons.test.ts
// собрать ctx где enrichment-query возвращает урок с course.partnerKey='mpstats', order: 9
// и проверить: result.results[0].locked === false && result.results[0].isPartner === true
```

> Использовать структуру и моки из существующего `packages/api/src/routers/__tests__/ai-searchLessons.test.ts` (тот же стиль createCaller/mock prisma). Замокать embedding/vector часть как там.

- [ ] **Step 2: Run — verify FAIL**

Run: `pnpm --filter @mpstats/api test ai-searchLessons-partner`
Expected: FAIL (нет `isPartner`, или `locked:true`).

- [ ] **Step 3: Extend enrichment query select**

В `ai.ts` enrichment-query (~280) расширить `course` select:

```typescript
include: {
  course: { select: { id: true, title: true, isHidden: true, partnerKey: true } },
  progress: { where: { path: { userId: ctx.user.id } }, take: 1 },
},
```

- [ ] **Step 4: Pass isPartnerFree to access + return routing hint**

В месте вычисления `locked` (~330):

```typescript
const isPartner = lesson.course.partnerKey != null;
const locked = !isLessonAccessible(
  { order: lesson.order, courseId: lesson.courseId, isPartnerFree: isPartner },
  subs,
  billingEnabled,
  isAdminBypass,
);
```

И в объект результата добавить поле `isPartner` (и/или `href: isPartner ? \`/mpstats-tools/${lesson.id}\` : \`/learn/${lesson.id}\``). Сохранить обратную совместимость существующих полей.

> НЕ добавлять `partnerKey: null` в where searchLessons — инвариант #2.

- [ ] **Step 5: Run — verify PASS**

Run: `pnpm --filter @mpstats/api test ai-searchLessons-partner`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/api/src/routers/ai.ts packages/api/src/routers/__tests__/ai-searchLessons-partner.test.ts
git commit -m "feat(62): keep partner lessons in AI search, unlocked + partner routing hint"
```

---

## Task 5: Partner tRPC router (getCatalog / getLesson / resolveModule)

**Files:**
- Create: `packages/api/src/routers/partner.ts`
- Modify: root router (`packages/api/src/server.ts` или где собирается `appRouter`) — подключить `partner: partnerRouter`
- Test: `packages/api/src/routers/__tests__/partner.test.ts`

Константа: `const MPSTATS_PARTNER_KEY = 'mpstats';`

- [ ] **Step 1: Write failing tests**

`packages/api/src/routers/__tests__/partner.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { partnerRouter } from '../partner';

function makeCtx(overrides: any = {}) {
  return {
    user: { id: 'user-1' },
    prisma: {
      lesson: { findMany: vi.fn(), findFirst: vi.fn(), findUnique: vi.fn() },
      userProfile: { findUnique: vi.fn().mockResolvedValue({ lastActiveAt: new Date() }), update: vi.fn() },
      ...overrides,
    },
  } as any;
}
beforeEach(() => vi.clearAllMocks());

describe('partner.resolveModule', () => {
  it('известный module-key → возвращает lessonId', async () => {
    const ctx = makeCtx();
    ctx.prisma.lesson.findFirst.mockResolvedValue({ id: 'mpstats_bidder_001' });
    const res = await partnerRouter.createCaller(ctx).resolveModule({ moduleKey: 'bidder-all' });
    expect(res).toEqual({ lessonId: 'mpstats_bidder_001' });
  });
  it('неизвестный module-key → lessonId null', async () => {
    const ctx = makeCtx();
    ctx.prisma.lesson.findFirst.mockResolvedValue(null);
    const res = await partnerRouter.createCaller(ctx).resolveModule({ moduleKey: 'nope' });
    expect(res).toEqual({ lessonId: null });
  });
});

describe('partner.getLesson', () => {
  it('возвращает урок партнёрского курса без paywall (locked всегда false)', async () => {
    const ctx = makeCtx();
    ctx.prisma.lesson.findUnique = vi.fn().mockResolvedValue({
      id: 'mpstats_bidder_001', courseId: 'mpstats_tools', title: 'Биддер',
      videoId: 'kx1', duration: 7, order: 1,
      course: { partnerKey: 'mpstats', title: 'Инструменты MPSTATS' }, metadata: {},
    });
    const res = await partnerRouter.createCaller(ctx).getLesson({ lessonId: 'mpstats_bidder_001' });
    expect(res?.locked).toBe(false);
    expect(res?.videoId).toBe('kx1');
  });
  it('не-партнёрский урок → NOT_FOUND/null (защита)', async () => {
    const ctx = makeCtx();
    ctx.prisma.lesson.findUnique = vi.fn().mockResolvedValue({
      id: 'x', courseId: '01_analytics', course: { partnerKey: null }, metadata: {},
    });
    await expect(partnerRouter.createCaller(ctx).getLesson({ lessonId: 'x' })).rejects.toThrow();
  });
});

describe('partner.getCatalog', () => {
  it('группирует уроки партнёрского курса по metadata.toolGroup', async () => {
    const ctx = makeCtx();
    ctx.prisma.lesson.findMany.mockResolvedValue([
      { id: 'l1', title: 'Биддер', order: 1, duration: 7, metadata: { toolGroup: 'Биддер' } },
      { id: 'l2', title: 'Пульс рекламы', order: 2, duration: 5, metadata: { toolGroup: 'Биддер' } },
      { id: 'l3', title: 'Плагин', order: 3, duration: 4, metadata: { toolGroup: 'Плагин' } },
    ]);
    const res = await partnerRouter.createCaller(ctx).getCatalog();
    expect(res.groups.map((g: any) => g.title)).toEqual(['Биддер', 'Плагин']);
    expect(res.groups[0].lessons).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run — verify FAIL**

Run: `pnpm --filter @mpstats/api test partner`
Expected: FAIL — `../partner` не существует.

- [ ] **Step 3: Implement partner.ts**

```typescript
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../trpc'; // путь по образцу других роутеров

const MPSTATS_PARTNER_KEY = 'mpstats';

export const partnerRouter = router({
  // Каталог: все видимые уроки партнёрского курса, сгруппированные по metadata.toolGroup
  getCatalog: protectedProcedure.query(async ({ ctx }) => {
    const lessons = await ctx.prisma.lesson.findMany({
      where: { isHidden: false, course: { partnerKey: MPSTATS_PARTNER_KEY, isHidden: false } },
      orderBy: { order: 'asc' },
      select: { id: true, title: true, description: true, order: true, duration: true, metadata: true },
    });
    // группировка по toolGroup с сохранением порядка появления
    const groupOrder: string[] = [];
    const map = new Map<string, any[]>();
    for (const l of lessons) {
      const group = (l.metadata as any)?.toolGroup ?? l.title;
      if (!map.has(group)) { map.set(group, []); groupOrder.push(group); }
      map.get(group)!.push({ id: l.id, title: l.title, order: l.order, duration: l.duration });
    }
    return {
      groups: groupOrder.map((title) => ({
        title,
        lessons: map.get(title)!,
        single: map.get(title)!.length === 1,
      })),
      totalLessons: lessons.length,
    };
  }),

  // Резолв deep-link: module-key -> lessonId
  resolveModule: protectedProcedure
    .input(z.object({ moduleKey: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const lesson = await ctx.prisma.lesson.findFirst({
        where: {
          isHidden: false,
          course: { partnerKey: MPSTATS_PARTNER_KEY, isHidden: false },
          metadata: { path: ['partnerModuleKey'], equals: input.moduleKey },
        },
        select: { id: true },
      });
      return { lessonId: lesson?.id ?? null };
    }),

  // Урок партнёрского курса — всегда unlocked (курс бесплатный)
  getLesson: protectedProcedure
    .input(z.object({ lessonId: z.string() }))
    .query(async ({ ctx, input }) => {
      const lesson = await ctx.prisma.lesson.findUnique({
        where: { id: input.lessonId },
        include: { course: { select: { partnerKey: true, title: true, isHidden: true } } },
      });
      if (!lesson || lesson.course.partnerKey !== MPSTATS_PARTNER_KEY || lesson.isHidden || lesson.course.isHidden) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Урок партнёрского курса не найден' });
      }
      return {
        id: lesson.id,
        courseId: lesson.courseId,
        title: lesson.title,
        description: lesson.description,
        videoId: lesson.videoId,
        videoUrl: lesson.videoUrl ?? '',
        duration: lesson.duration ?? 0,
        order: lesson.order,
        courseTitle: lesson.course.title,
        locked: false,
      };
    }),
});
```

> Сверить точные импорты `router`/`protectedProcedure` и heartbeat-паттерн `userProfile.update(lastActiveAt)` с соседним роутером (job.ts/learning.ts) — protectedProcedure в проекте обновляет `lastActiveAt` (см. UserActivityDay heartbeat). Ничего дополнительно делать не нужно, это в middleware.

- [ ] **Step 4: Wire into root router**

В файле сборки `appRouter` добавить `partner: partnerRouter` (импорт сверху). Найти существующий root router (grep `learning: learningRouter`).

- [ ] **Step 5: Run — verify PASS**

Run: `pnpm --filter @mpstats/api test partner`
Expected: PASS (все кейсы).

- [ ] **Step 6: Commit**

```bash
git add packages/api/src/routers/partner.ts packages/api/src/routers/__tests__/partner.test.ts packages/api/src/server.ts
git commit -m "feat(62): partner course tRPC router (catalog, getLesson, resolveModule)"
```

---

## Task 6: Манифест + сид партнёрского курса

**Files:**
- Create: `scripts/seed/mpstats-tools-manifest.json`
- Create: `scripts/seed/seed-mpstats-tools.ts`

> Реальные `videoId` (Kinescope) заполняет владелец по мере загрузки видео. Сид идемпотентен (upsert) — можно перезапускать.

- [ ] **Step 1: Create manifest skeleton**

`scripts/seed/mpstats-tools-manifest.json` — Course + 15 групп / 42 урока. Структура из `E:\Academy Courses\Free Course MPSTATS instruments`. `videoId` — пустые строки (заполнит владелец), `partnerModuleKey` — стабильные kebab-case ключи (согласовать с командой MPSTATS перед проставлением кнопок):

```json
{
  "course": {
    "id": "mpstats_tools",
    "title": "Инструменты MPSTATS",
    "slug": "mpstats-tools",
    "description": "Видеоуроки по инструментам сервиса аналитики MPSTATS",
    "partnerKey": "mpstats"
  },
  "lessons": [
    { "id": "mpstats_bidder_001", "toolGroup": "Биддер", "title": "Биддер (полный обзор)", "partnerModuleKey": "bidder-overview", "videoId": "" },
    { "id": "mpstats_bidder_002", "toolGroup": "Биддер", "title": "Журнал продвижения", "partnerModuleKey": "bidder-journal", "videoId": "" },
    { "id": "mpstats_bidder_003", "toolGroup": "Биддер", "title": "Проверка рекламных позиций", "partnerModuleKey": "bidder-ad-positions", "videoId": "" },
    { "id": "mpstats_bidder_004", "toolGroup": "Биддер", "title": "Пульс рекламы", "partnerModuleKey": "bidder-pulse", "videoId": "" },

    { "id": "mpstats_ext_wb_001", "toolGroup": "Внешняя аналитика ВБ", "title": "Анализ отзывов", "partnerModuleKey": "ext-wb-reviews", "videoId": "" },
    { "id": "mpstats_ext_wb_002", "toolGroup": "Внешняя аналитика ВБ", "title": "Категории", "partnerModuleKey": "ext-wb-categories", "videoId": "" },
    { "id": "mpstats_ext_wb_003", "toolGroup": "Внешняя аналитика ВБ", "title": "Товары в поиске", "partnerModuleKey": "ext-wb-search-items", "videoId": "" },
    { "id": "mpstats_ext_wb_004", "toolGroup": "Внешняя аналитика ВБ", "title": "Группы", "partnerModuleKey": "ext-wb-groups", "videoId": "" },
    { "id": "mpstats_ext_wb_005", "toolGroup": "Внешняя аналитика ВБ", "title": "Поиск по SKU", "partnerModuleKey": "ext-wb-sku-search", "videoId": "" },
    { "id": "mpstats_ext_wb_006", "toolGroup": "Внешняя аналитика ВБ", "title": "Продавцы", "partnerModuleKey": "ext-wb-sellers", "videoId": "" },
    { "id": "mpstats_ext_wb_007", "toolGroup": "Внешняя аналитика ВБ", "title": "Анализ характеристик SKU", "partnerModuleKey": "ext-wb-sku-attrs", "videoId": "" },

    { "id": "mpstats_ext_ozon_001", "toolGroup": "Внешняя аналитика Озон", "title": "Выбор ниши", "partnerModuleKey": "ext-ozon-niche", "videoId": "" },
    { "id": "mpstats_ext_ozon_002", "toolGroup": "Внешняя аналитика Озон", "title": "Поиск по SKU", "partnerModuleKey": "ext-ozon-sku-search", "videoId": "" },
    { "id": "mpstats_ext_ozon_003", "toolGroup": "Внешняя аналитика Озон", "title": "Группы", "partnerModuleKey": "ext-ozon-groups", "videoId": "" },
    { "id": "mpstats_ext_ozon_004", "toolGroup": "Внешняя аналитика Озон", "title": "Категории", "partnerModuleKey": "ext-ozon-categories", "videoId": "" },
    { "id": "mpstats_ext_ozon_005", "toolGroup": "Внешняя аналитика Озон", "title": "Анализ характеристик SKU", "partnerModuleKey": "ext-ozon-sku-attrs", "videoId": "" },
    { "id": "mpstats_ext_ozon_006", "toolGroup": "Внешняя аналитика Озон", "title": "Бренды", "partnerModuleKey": "ext-ozon-brands", "videoId": "" },
    { "id": "mpstats_ext_ozon_007", "toolGroup": "Внешняя аналитика Озон", "title": "Продавцы", "partnerModuleKey": "ext-ozon-sellers", "videoId": "" },

    { "id": "mpstats_cab_wb_001", "toolGroup": "Кабинет ВБ", "title": "Загрузка себестоимости", "partnerModuleKey": "cab-wb-cost", "videoId": "" },
    { "id": "mpstats_cab_wb_002", "toolGroup": "Кабинет ВБ", "title": "Кабинет ВБ (обзор)", "partnerModuleKey": "cab-wb-overview", "videoId": "" },
    { "id": "mpstats_cab_wb_003", "toolGroup": "Кабинет ВБ", "title": "Продажи и заказы", "partnerModuleKey": "cab-wb-sales-orders", "videoId": "" },
    { "id": "mpstats_cab_wb_004", "toolGroup": "Кабинет ВБ", "title": "Расчёт поставки", "partnerModuleKey": "cab-wb-supply", "videoId": "" },
    { "id": "mpstats_cab_wb_005", "toolGroup": "Кабинет ВБ", "title": "Сводка", "partnerModuleKey": "cab-wb-summary", "videoId": "" },

    { "id": "mpstats_seo_001", "toolGroup": "Модуль SEO", "title": "Вступление + результаты поиска (SERP)", "partnerModuleKey": "seo-serp", "videoId": "" },
    { "id": "mpstats_seo_002", "toolGroup": "Модуль SEO", "title": "Товары", "partnerModuleKey": "seo-products", "videoId": "" },
    { "id": "mpstats_seo_003", "toolGroup": "Модуль SEO", "title": "Бренды", "partnerModuleKey": "seo-brands", "videoId": "" },
    { "id": "mpstats_seo_004", "toolGroup": "Модуль SEO", "title": "Мониторинг позиций", "partnerModuleKey": "seo-position-monitoring", "videoId": "" },
    { "id": "mpstats_seo_005", "toolGroup": "Модуль SEO", "title": "Проверка группы запросов", "partnerModuleKey": "seo-query-group-check", "videoId": "" },
    { "id": "mpstats_seo_006", "toolGroup": "Модуль SEO", "title": "Проверка карточки товара", "partnerModuleKey": "seo-card-check", "videoId": "" },
    { "id": "mpstats_seo_007", "toolGroup": "Модуль SEO", "title": "Поиск кластеров", "partnerModuleKey": "seo-clusters", "videoId": "" },
    { "id": "mpstats_seo_008", "toolGroup": "Модуль SEO", "title": "Расширение запросов", "partnerModuleKey": "seo-query-expansion", "videoId": "" },
    { "id": "mpstats_seo_009", "toolGroup": "Модуль SEO", "title": "AI", "partnerModuleKey": "seo-ai", "videoId": "" },

    { "id": "mpstats_autoreply_001", "toolGroup": "Автоответы", "title": "Автоответы", "partnerModuleKey": "autoreply", "videoId": "" },
    { "id": "mpstats_extads_001", "toolGroup": "Внешняя реклама", "title": "Внешняя реклама", "partnerModuleKey": "external-ads", "videoId": "" },
    { "id": "mpstats_ym_groups_001", "toolGroup": "Группы Яндекс Маркет", "title": "Группы Яндекс Маркет", "partnerModuleKey": "ym-groups", "videoId": "" },
    { "id": "mpstats_mycards_001", "toolGroup": "Мои карточки", "title": "Мои карточки", "partnerModuleKey": "my-cards", "videoId": "" },
    { "id": "mpstats_plugin_001", "toolGroup": "Плагин", "title": "Плагин", "partnerModuleKey": "plugin", "videoId": "" },
    { "id": "mpstats_rnp_001", "toolGroup": "РНП", "title": "РНП", "partnerModuleKey": "rnp", "videoId": "" },
    { "id": "mpstats_repricer_ozon_001", "toolGroup": "Репрайсер Озон", "title": "Репрайсер Озон", "partnerModuleKey": "repricer-ozon", "videoId": "" },
    { "id": "mpstats_repricer_wb_001", "toolGroup": "Репрайсер ВБ", "title": "Репрайсер ВБ", "partnerModuleKey": "repricer-wb", "videoId": "" },
    { "id": "mpstats_pricing_001", "toolGroup": "Управление ценой и скидками", "title": "Управление ценой и скидками", "partnerModuleKey": "price-discount-mgmt", "videoId": "" },
    { "id": "mpstats_photo_001", "toolGroup": "Фоторедактор", "title": "Фоторедактор", "partnerModuleKey": "photo-editor", "videoId": "" }
  ]
}
```

- [ ] **Step 2: Create seed script**

`scripts/seed/seed-mpstats-tools.ts` (по образцу `seed-skill-lessons.ts`):

```typescript
import { PrismaClient } from '@mpstats/db';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const prisma = new PrismaClient();

async function main() {
  const manifest = JSON.parse(
    readFileSync(join(__dirname, 'mpstats-tools-manifest.json'), 'utf-8'),
  );
  const c = manifest.course;

  await prisma.course.upsert({
    where: { id: c.id },
    update: { title: c.title, description: c.description, slug: c.slug, partnerKey: c.partnerKey, isFree: true, isHidden: false },
    create: { id: c.id, title: c.title, description: c.description, slug: c.slug, partnerKey: c.partnerKey, isFree: true, isHidden: false, order: 0, duration: 0 },
  });

  let order = 0;
  let totalDuration = 0;
  for (const l of manifest.lessons) {
    order += 1;
    const duration = l.duration ?? 0;
    totalDuration += duration;
    await prisma.lesson.upsert({
      where: { id: l.id },
      update: {
        title: l.title,
        videoId: l.videoId || null,
        duration: duration || null,
        order,
        metadata: { toolGroup: l.toolGroup, partnerModuleKey: l.partnerModuleKey },
      },
      create: {
        id: l.id,
        courseId: c.id,
        title: l.title,
        description: null,
        videoId: l.videoId || null,
        duration: duration || null,
        order,
        skillCategory: 'ANALYTICS', // нейтрально; в диагностику не идёт (partnerKey isolation)
        skillBlocks: undefined,      // ОБЯЗАТЕЛЬНО null — вне playbook-машинерии
        metadata: { toolGroup: l.toolGroup, partnerModuleKey: l.partnerModuleKey },
      },
    });
  }

  await prisma.course.update({ where: { id: c.id }, data: { duration: totalDuration } });
  console.log(`Seeded ${manifest.lessons.length} lessons into ${c.id}`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
```

- [ ] **Step 3: Run seed against dev DB**

Run: `pnpm tsx scripts/seed/seed-mpstats-tools.ts` (с dev `DATABASE_URL`)
Expected: `Seeded 42 lessons into mpstats_tools`. Проверить: `Course.partnerKey='mpstats'`, 42 урока, у каждого `metadata.partnerModuleKey`.

- [ ] **Step 4: Commit**

```bash
git add scripts/seed/mpstats-tools-manifest.json scripts/seed/seed-mpstats-tools.ts
git commit -m "feat(62): manifest + seed for MPSTATS tools partner course"
```

---

## Task 7: Sidebar + mobile-nav — пункт «Инструменты MPSTATS» (зелёная иконка)

**Files:**
- Modify: `apps/web/src/components/shared/sidebar.tsx` (navItems ~36-64, render ~111-131)
- Modify: `apps/web/src/components/shared/mobile-nav.tsx` (items ~14-51)

> Иконка: треугольники MPSTATS в фирменном зелёном. До получения точного SVG/hex из `go_mpstats_academy/brand-assets/` — использовать плейсхолдер-зелёный `#00B341` (заменить на точный бренд-hex; ОТКРЫТЫЙ пункт спека). Цвет задаётся прямо на svg (`className="w-5 h-5 text-[#00B341]"`), а не `stroke="currentColor"` — чтобы иконка была цветной в отличие от остальных.

- [ ] **Step 1: Add nav item to sidebar**

В `navItems` (sidebar.tsx) добавить (расположение — после «Обучение»-группы/«Диагностика», до admin/support; согласовать визуально):

```tsx
{
  title: 'Инструменты MPSTATS',
  href: '/mpstats-tools',
  icon: (
    <svg className="w-5 h-5 text-[#00B341]" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      {/* треугольники MPSTATS — заменить на точный бренд-SVG из brand-assets */}
      <path d="M12 3l4 7H8l4-7zM6 13l3 5H3l3-5zm12 0l3 5h-6l3-5z" />
    </svg>
  ),
},
```

Active-state логика уже общая (`pathname === item.href || pathname.startsWith(item.href + '/')`) — не трогать.

- [ ] **Step 2: Mirror in mobile-nav**

Добавить аналогичный item в `mobile-nav.tsx` (иконка `w-6 h-6 text-[#00B341]`). Учесть существующую логику push/splice — вставить в основной список (не в admin/support хвост).

- [ ] **Step 3: Verify visually**

Run: `pnpm --filter web dev` → открыть платформу залогиненным → в sidebar и mobile-nav виден пункт «Инструменты MPSTATS» с зелёной иконкой (единственная цветная), клик ведёт на `/mpstats-tools`.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/shared/sidebar.tsx apps/web/src/components/shared/mobile-nav.tsx
git commit -m "feat(62): add 'Инструменты MPSTATS' nav item with brand-green icon"
```

---

## Task 8: Каталог `/mpstats-tools` + резолв deep-link

**Files:**
- Create: `apps/web/src/app/(main)/mpstats-tools/page.tsx`
- Create: `apps/web/src/components/mpstats-tools/ToolsCatalog.tsx`

- [ ] **Step 1: Page (server) — deep-link resolution + render catalog**

`apps/web/src/app/(main)/mpstats-tools/page.tsx`:

```tsx
import { redirect } from 'next/navigation';
import { createServerCaller } from '@/lib/trpc/server'; // сверить точный helper серверного caller в проекте
import { ToolsCatalog } from '@/components/mpstats-tools/ToolsCatalog';

export const dynamic = 'force-dynamic';

export default async function MpstatsToolsPage({
  searchParams,
}: {
  searchParams: { module?: string };
}) {
  const caller = await createServerCaller();
  const moduleKey = searchParams.module;

  if (moduleKey) {
    const { lessonId } = await caller.partner.resolveModule({ moduleKey });
    if (lessonId) redirect(`/mpstats-tools/${lessonId}`);
    // неизвестный ключ → показать каталог + тост (через query-флаг)
    redirect('/mpstats-tools?notfound=1');
  }

  const catalog = await caller.partner.getCatalog();
  return <ToolsCatalog catalog={catalog} />;
}
```

> Сверить, как в проекте делается server-side tRPC caller (grep `createServerCaller`/`appRouter.createCaller` в apps/web/src/lib/trpc). Если серверного caller нет — сделать страницу client-компонентом с `trpc.partner.*.useQuery` и резолвить `?module=` через `useEffect` + `router.replace`. Выбрать паттерн, уже принятый в репозитории.

- [ ] **Step 2: ToolsCatalog client component**

`apps/web/src/components/mpstats-tools/ToolsCatalog.tsx` — сетка «инструментов». Многоурочная группа = карточка с раскрытием/списком уроков; одиночная (`single: true`) = карточка-ссылка прямо на урок. Ссылки → `/mpstats-tools/<lessonId>`. Заголовок раздела «Инструменты MPSTATS» + краткое intro. Если `?notfound=1` — показать toast/баннер «Урок не найден, вот весь каталог». Стилистика — по образцу карточек `/learn` (Phase 57/61).

- [ ] **Step 3: Verify**

Run: dev → `/mpstats-tools` показывает 15 групп; `/mpstats-tools?module=plugin` редиректит на урок «Плагин»; `/mpstats-tools?module=zzz` → каталог + тост.

- [ ] **Step 4: Commit**

```bash
git add "apps/web/src/app/(main)/mpstats-tools/page.tsx" apps/web/src/components/mpstats-tools/ToolsCatalog.tsx
git commit -m "feat(62): /mpstats-tools catalog page + deep-link module resolution"
```

---

## Task 9: Плеер урока `/mpstats-tools/[lessonId]`

**Files:**
- Create: `apps/web/src/app/(main)/mpstats-tools/[lessonId]/page.tsx`
- Create: `apps/web/src/components/mpstats-tools/PartnerLessonView.tsx`

> Переиспользуем `VideoPlayer` (`@/components/video/KinescopePlayer`), `trpc.ai.chat` (AI-чат по lessonId), `trpc.learning.saveWatchProgress`/`getWatchProgress` (прогресс — авто-создаёт путь). Без paywall (partner.getLesson всегда unlocked).

- [ ] **Step 1: Page (client) shell**

`apps/web/src/app/(main)/mpstats-tools/[lessonId]/page.tsx`:

```tsx
'use client';
import { useParams } from 'next/navigation';
import { PartnerLessonView } from '@/components/mpstats-tools/PartnerLessonView';

export default function PartnerLessonPage() {
  const params = useParams();
  return <PartnerLessonView lessonId={params.lessonId as string} />;
}
```

- [ ] **Step 2: PartnerLessonView**

`apps/web/src/components/mpstats-tools/PartnerLessonView.tsx` — собрать из существующих компонентов, ориентируясь на `(main)/learn/[id]/page.tsx`:
- `trpc.partner.getLesson.useQuery({ lessonId })`
- крошки «Инструменты MPSTATS / [courseTitle? нет — название урока]» → ссылка назад на `/mpstats-tools`
- `<VideoPlayer videoId={lesson.videoId} onTimeUpdate={...} initialTime={watchProgress?.lastPosition} durationSeconds={lesson.duration*60} />`
- прогресс: `trpc.learning.saveWatchProgress.useMutation()` в `onTimeUpdate` (как в learn/[id]); `trpc.learning.getWatchProgress.useQuery({ lessonId })` для initialTime
- AI-чат: переиспользовать desktop chat-блок из learn/[id] (или вынести общий компонент, если тривиально) с `trpc.ai.chat.useMutation()` и тем же input `{ lessonId, message, history }`
- НЕ показывать LockOverlay (урок всегда доступен)
- НЕ показывать prev/next в стиле трека — опционально prev/next внутри toolGroup (можно отложить; для Part 1 достаточно «назад к каталогу»)

> Если AI-чат блок в learn/[id] не вынесен в переиспользуемый компонент — для Part 1 допустимо встроить упрощённый чат-блок здесь (тот же mutation/IO). Не рефакторить learn/[id] без необходимости.

- [ ] **Step 3: Verify**

Run: dev → открыть урок (с тестовым videoId). Видео в плеере, прогресс сохраняется (проверить `LessonProgress` строку), AI-чат отвечает после ingestion (до ingestion — пустые источники, это ок). Нет paywall.

- [ ] **Step 4: Commit**

```bash
git add "apps/web/src/app/(main)/mpstats-tools/[lessonId]/page.tsx" apps/web/src/components/mpstats-tools/PartnerLessonView.tsx
git commit -m "feat(62): partner lesson player view (reuses video/chat/progress)"
```

---

## Task 10: Роутинг партнёрских результатов в общем AI-поиске

**Files:**
- Modify: `apps/web/src/components/learning/AgentSearch.tsx` (или компонент, рендерящий результаты `ai.searchLessons` в «Базе знаний» `/learn/library`)

- [ ] **Step 1: Найти рендер результатов searchLessons**

Grep `searchLessons` в `apps/web/src` → найти компонент, который маппит результаты в ссылки на уроки.

- [ ] **Step 2: Использовать isPartner/href из Task 4**

Где формируется ссылка на урок-результат, использовать поле `isPartner` (или `href`), добавленное в Task 4: партнёрские уроки ведут на `/mpstats-tools/<id>`, остальные — на `/learn/<id>` (текущее поведение). Бейдж «Инструменты MPSTATS» на партнёрском результате — опционально.

- [ ] **Step 3: Verify**

Run: dev → в «Базе знаний» поиск по теме инструмента (после ingestion) показывает партнёрский урок, клик ведёт в `/mpstats-tools/<id>`, без замка.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/learning/AgentSearch.tsx
git commit -m "feat(62): route partner lessons from AI search to /mpstats-tools"
```

---

## Task 11: Полная проверка (tests / typecheck / build)

- [ ] **Step 1: API tests**

Run: `pnpm --filter @mpstats/api test`
Expected: все зелёные (новые + существующие; диагностика/learning без регрессий).

- [ ] **Step 2: Web tests**

Run: `pnpm --filter web test`
Expected: зелёные.

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: 0 ошибок (web + api).

- [ ] **Step 4: Build**

Run: `pnpm build`
Expected: успешно.

- [ ] **Step 5: Commit (если были мелкие фиксы)**

```bash
git add -A && git commit -m "test(62): green tests + typecheck + build for partner course"
```

---

## Task 12: Деплой (runtime, выполняет владелец/деплой-агент)

> НЕ автоматизируется в плане — фиксируем процедуру.

- [ ] **Step 1: Применить миграцию `partnerKey` на prod через Supabase Management API**

Аддитивный `ALTER TABLE "Course" ADD COLUMN "partnerKey" TEXT;` + индекс + запись в `_prisma_migrations` (checksum). Паттерн: `~/.claude/projects/D--GpT-docs-MPSTATS-ACADEMY-ADAPTIVE-LEARNING-MAAL/memory/reference_supabase_migration_via_mgmt_api.md`.

- [ ] **Step 2: Заполнить `videoId` в манифесте** (Kinescope) по мере загрузки видео, прогнать сид против prod (через скрипт с prod `DATABASE_URL`, только INSERT/UPDATE строк Course/Lesson — безопасно, не DDL).

- [ ] **Step 3: Staging deploy** ветки `phase-62-mpstats-tools` (docker `--no-cache`), content-check бандла, smoke.

- [ ] **Step 4: Merge → prod deploy** по стандартной процедуре.

- [ ] **Step 5: Согласовать с командой MPSTATS** список `partnerModuleKey` для кнопок в сервисе MPSTATS (deep-link).

---

## Самопроверка плана (выполнена при написании)

- **Покрытие спека:** модель (T1) ✓; изоляция диагностики/трека/каталога (T3) ✓; searchLessons inclusion (T4) ✓; доступ free (T2) ✓; роутинг/каталог/плеер/deep-link (T5,T8,T9) ✓; sidebar иконка (T7) ✓; RAG — вне scope (ingestion отдельно), но search-routing (T10) ✓; Часть 2 (auth) — явно отложена ✓.
- **Инвариант isFree-trap** — закрыт (T2 на partnerKey, не isFree).
- **Открытые пункты** (не блокеры реализации): точный бренд-hex/SVG зелёной иконки (T7); реальные videoId и финальные partnerModuleKey (T6/T12 — данные владельца); точный серверный tRPC-caller паттерн (T8 — сверить в репо).
