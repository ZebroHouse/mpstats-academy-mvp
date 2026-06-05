---
phase: 61-learning-2-0
reviewed: 2026-06-03T00:00:00Z
depth: standard
files_reviewed: 17
files_reviewed_list:
  - packages/api/src/routers/favorite.ts
  - packages/api/src/routers/material.ts
  - packages/api/src/root.ts
  - scripts/migrate-track-to-favorites.ts
  - apps/web/src/components/learning/FavoriteButton.tsx
  - apps/web/src/components/learning/AgentSearch.tsx
  - apps/web/src/components/learning/JobCard.tsx
  - apps/web/src/components/learning/JobCatalog.tsx
  - apps/web/src/components/learning/LearningHero.tsx
  - apps/web/src/components/learning/LearningTabs.tsx
  - apps/web/src/components/learning/LessonResultCard.tsx
  - apps/web/src/components/learning/MaterialCard.tsx
  - apps/web/src/components/shared/sidebar.tsx
  - apps/web/src/components/shared/mobile-nav.tsx
  - apps/web/src/app/(main)/learn/page.tsx
  - apps/web/src/app/(main)/learn/plan/page.tsx
  - apps/web/src/app/(main)/learn/solutions/page.tsx
  - apps/web/src/app/(main)/learn/library/page.tsx
  - apps/web/src/app/(main)/learn/favorites/page.tsx
  - apps/web/src/app/(main)/learn/track/page.tsx
  - apps/web/src/app/(main)/dashboard/page.tsx
  - apps/web/src/lib/tours/definitions.ts
  - packages/db/prisma/schema.prisma
  - packages/db/prisma/migrations/20260603000000_add_favorite/migration.sql
findings:
  critical: 0
  warning: 4
  info: 6
  total: 10
status: issues_found
---

# Phase 61: Code Review Report

**Reviewed:** 2026-06-03
**Depth:** standard
**Files Reviewed:** 24 (17 in primary scope + supporting cross-refs)
**Status:** issues_found

## Summary

Phase 61 «Обучение 2.0» вводит полиморфную модель `Favorite`, user-facing `material.listForUser`, миграцию трека в избранное и 4-маршрутную `/learn/*` навигацию. Я провёл адверсариальный обзор с фокусом на IDOR/access-control, утечку `storagePath`, идемпотентность миграции и границы server/client + Rules-of-Hooks.

**Хорошие новости по приоритетным зонам:**
- **IDOR на `favorite.ts`** — закрыт корректно. Все 4 процедуры берут `userId` исключительно из `ctx.user.id`; `input` несёт только `{itemType, itemId}`. `remove`/`list`/`isFavorited` scoped по `ctx.user.id`. Тесты явно проверяют игнор attacker-supplied `userId`.
- **`material.listForUser`** — `where.isHidden = false` форсится безусловно, нет `includeHidden` escape; `storagePath` выбирается, но строго стрипается в `.map()` перед возвратом (только `hasFile` boolean). Download-ACL `getSignedUrl` не ослаблен.
- **Миграция** — идемпотентна (`createMany({skipDuplicates:true})` на `@@unique`), `LessonProgress` только `count()`-ится с before/after assert, читает лишь `custom`-секцию и `addedJobs`. `collectFavoriteRows` — чистая, дедуп внутри юзера.
- **Server/client границы** — `/learn`, `/learn/track` — серверные `redirect()` (не client-nav), что соответствует фиксу incident 2026-05-19. `FavoriteButton` корректно держит все хуки над любыми ранними возвратами.

Критических дефектов не найдено. Ниже — 4 WARNING (один реальный функциональный баг с migration consistency, остальные — устойчивость/корректность) и 6 INFO.

## Narrative Findings (AI reviewer)

## Warnings

### WR-01: `material.delete` помечает `isHidden=true`, но НЕ обнуляет `storagePath` → orphan ACL/leak risk и битый ре-attach

**File:** `packages/api/src/routers/material.ts:306-348`
**Issue:** При soft-delete файл удаляется из Storage (строки 322-338), но в БД ставится только `isHidden=true` — `storagePath` остаётся непустым, указывая на уже несуществующий объект. Последствия:
1. `getSignedUrl` для скрытого материала отбивается на `material.isHidden` (NOT_FOUND) — это ок. Но если админ позже снимет `isHidden` (восстановит), `storagePath` всё ещё указывает на удалённый файл — `createSignedUrl` отдаст ссылку на 404/чужой объект, если path переиспользован. Storage path содержит `Date.now()+random`, коллизия маловероятна, но запись «висит» как валидная.
2. `listForUser` отдаёт `hasFile: storagePath != null` — у восстановленного материала будет `hasFile=true`, кнопка скачивания активна, а файла нет → юзер получает ошибку при клике.

**Fix:** При soft-delete обнулять путь и связанные поля, чтобы инвариант «storagePath есть ⇒ файл есть» держался:
```ts
await ctx.prisma.material.update({
  where: { id: input.id },
  data: { isHidden: true, storagePath: null, fileSize: null, fileMimeType: null },
});
```

### WR-02: `material.update` позволяет рассогласовать XOR-инвариант `externalUrl`⊕`storagePath`

**File:** `packages/api/src/routers/material.ts:277-304`
**Issue:** `createInputSchema` жёстко требует ровно одно из `externalUrl`/`storagePath` (`.refine`, строки 91-94). Но `update` проверяет XOR только когда **оба** поля присутствуют в input одновременно (строки 283-287). Если материал создан с `externalUrl`, а апдейт присылает только `storagePath` (не трогая `externalUrl`), проверка `rest.externalUrl !== undefined && rest.storagePath !== undefined` ложна → апдейт проходит, и в БД оказывается материал, у которого **оба** поля заполнены. Это нарушает D-03 инвариант, на котором завязан `getSignedUrl` (он берёт `storagePath`, игнорируя `externalUrl`) и `MaterialCard` (`externalUrl` имеет приоритет в `handleClick`, строки 62-65) → расхождение поведения download vs. что показано.

**Fix:** Подгружать текущую запись и проверять эффективное состояние после слияния, либо запретить апдейт, выставляющий оба:
```ts
const current = await ctx.prisma.material.findUnique({ where: { id }, select: { externalUrl: true, storagePath: true } });
const nextExternal = rest.externalUrl !== undefined ? rest.externalUrl : current?.externalUrl;
const nextStorage  = rest.storagePath !== undefined ? rest.storagePath : current?.storagePath;
if (Boolean(nextExternal) === Boolean(nextStorage)) {
  throw new TRPCError({ code: 'BAD_REQUEST', message: 'Exactly one of externalUrl/storagePath required (D-03)' });
}
```

### WR-03: Миграция не дедуплицирует против уже существующих `Favorite`-строк от живого UI → re-run при гонке double-insert не страшен, но `inserted`-метрика и dry-run вводят в заблуждение

**File:** `scripts/migrate-track-to-favorites.ts:120-128`
**Issue:** `skipDuplicates:true` защищает от дублей на уровне БД (`@@unique`), и это корректно. Однако к моменту прогона миграции на проде сердечки уже живые (Wave A-C задеплоены), и юзеры могли вручную добавить в избранное те же уроки/джобы, что лежат в `custom`-секции трека. Тогда `dry-run` посчитает `totalRows` (кандидаты), а реальный `--apply` вставит меньше (`inserted < totalRows`) — это нормально и безопасно (идемпотентность держится), но оператор за owner-gated checkpoint увидит расхождение `totalRows` vs `inserted` и может ошибочно решить, что миграция «потеряла» строки. Это операционный риск на проде (CLAUDE.md: prod БД, owner-gated).

**Fix:** В CLI-выводе явно различать «уже в избранном» от «вставлено»: после `--apply` дополнительно логировать `skipped = totalRows - inserted` с пояснением «(уже в избранном — это норма)». Минимально — добавить строку в `main()`:
```ts
console.log(`Skipped (already favorited): ${r.totalRows - r.inserted} (expected — idempotent)`);
```

### WR-04: `library/page.tsx` — поиск из `AgentSearch` рендерит результаты внутри Hero, но основной каталог под ним остаётся видимым → дублирующийся/конфликтующий UI

**File:** `apps/web/src/app/(main)/learn/library/page.tsx:251-275` + `components/learning/AgentSearch.tsx:217-245`
**Issue:** `AgentSearch scope="library"` рендерит блок результатов (уроки + материалы) сразу под инпутом внутри `LearningHero`. Но страница ниже **безусловно** продолжает рендерить аккордеон курсов (`!showMaterials` ветка, строки 318-449) или сетку материалов. После поиска юзер видит и результаты поиска (в hero), и полный немодифицированный каталог под ним — нет состояния «поиск активен → каталог скрыт/приглушён». Это не краш, но UX-баг: непонятно, какой блок отвечает на запрос. Пользователь может прокрутить мимо результатов поиска прямо в полный каталог.

**Fix:** Прокинуть из `AgentSearch` callback/состояние «есть активный результат» и скрывать каталог (или показывать «Результаты поиска» заголовок + кнопку «Сбросить»), когда `libResult` непуст. Либо — поднять состояние поиска на уровень страницы.

## Info

### IN-01: Противоречивый комментарий о `storagePath` в `listForUser`

**File:** `packages/api/src/routers/material.ts:240-242`
**Issue:** Комментарий гласит «storagePath НЕ выбираем для клиента», но следующая строка его именно `select: true`. Фактически поведение верное (выбирается, затем стрипается в `.map`, строки 247-250), но комментарий прямо противоречит коду и собьёт будущего разработчика — кто-то может «исправить» комментарий, убрав `storagePath` из select, и сломать `hasFile`.
**Fix:** Заменить на «storagePath выбираем для деривации hasFile, но НИКОГДА не отдаём клиенту — стрипается ниже в .map()».

### IN-02: `material.list` (admin) — потенциальный двойной запрос count при больших выборках

**File:** `packages/api/src/routers/material.ts:137-156`
**Issue:** `findMany` + отдельный `count` с тем же `where`. Не баг (вне scope перфоманса), но `nextCursor` логика (`items.length === input.limit`) и отдельный totalCount могут рассинхронизироваться при конкурентной вставке. Приемлемо для admin-эндпоинта.
**Fix:** Опционально — оставить как есть; admin read, низкий трафик.

### IN-03: `favorite.list` resolution для JOB использует `isPublished`, для MATERIAL — `isHidden`, для LESSON — `isHidden` + `course.isHidden`

**File:** `packages/api/src/routers/favorite.ts:119-149`
**Issue:** Три разных критерия видимости для трёх типов — это корректно отражает разные модели (Job.isPublished vs Lesson/Material.isHidden), но нигде не задокументирован риск: если в Job добавят `isHidden` в будущем, этот резолвер его не подхватит. Сейчас верно.
**Fix:** Комментарий уже частично есть (строка 138). Достаточно.

### IN-04: `LearningTabs` (mobile) и tour anchor `learn-submenu` (desktop sidebar) — tour на мобиле может не найти якорь

**File:** `apps/web/src/lib/tours/definitions.ts:63-85` + `components/learning/LearningTabs.tsx`
**Issue:** `learnCoursesSteps[0]` и `learnTrackSteps[0]` якорятся на `[data-tour="learn-submenu"]`, который существует только в desktop `sidebar.tsx` (`md:flex`, скрыт на мобиле). На мобиле sub-навигация — это `LearningTabs` (`md:hidden`), у которого НЕТ `data-tour="learn-submenu"`. На мобильном `/learn/*` тур-шаг 1 не найдёт элемент (driver.js пропустит или сломает позиционирование).
**Fix:** Добавить `data-tour="learn-submenu"` на `<nav>` в `LearningTabs.tsx`, либо в `getSteps` свапать anchor на мобиле (как уже делается для dashboard sidebar→mobile-nav, строки 178-184).

### IN-05: `JobCard.onAddToTrack` проп объявлен, но `JobCatalog` его не передаёт → мёртвая «+ В трек» кнопка в /learn/solutions

**File:** `apps/web/src/components/learning/JobCard.tsx:60-73` + `JobCatalog.tsx:61-66`
**Issue:** `JobCard` рендерит кнопку «+ В трек» только если передан `onAddToTrack`. `JobCatalog` монтирует `JobCard` без этого пропа, поэтому в каталоге решений кнопки добавления нет (добавление идёт только через `AgentSearch`). Возможно, это намеренный дизайн (D-09), но проп выглядит как недореализованная фича. Не баг, но dead capability.
**Fix:** Либо удалить `onAddToTrack`/`isAddPending` из `JobCard`, если каталог их не использует, либо прокинуть из `JobCatalog`/`SolutionsPage`.

### IN-06: `favorites/page.tsx` — клик по MATERIAL-избранному ведёт на `/learn/library`, а не на сам материал

**File:** `apps/web/src/app/(main)/learn/favorites/page.tsx:156`
**Issue:** `describe()` для MATERIAL возвращает `href: '/learn/library'` (нет deep-link на конкретный материал). Юзер кликает на сохранённый материал и попадает на общую Базу знаний без фокуса/фильтра на этот материал. Функционально работает, но неожиданно для пользователя.
**Fix:** Если есть стабильный якорь/фильтр — линковать `/learn/library?material=<id>` или `#material-<id>`; иначе оставить, но это деградация UX избранного.

---

## Out-of-scope notes

- Terminology canon («трек»/«плейбук»/«джоба») — вне scope (grep-verified). Замечу лишь, что `JobCard.tsx:71` всё ещё содержит UI-строку «+ В трек» и `JobCard:40` «В треке» — если canon требует «план», это leak, но по заданию не проверяю.
- Performance (двойные count, N+1) — вне scope v1, отмечено только где пересекается с корректностью.

---

_Reviewed: 2026-06-03_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
