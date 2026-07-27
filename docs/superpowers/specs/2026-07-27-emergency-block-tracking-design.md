# Трекинг ЧП-блока «Склады WB под ударом» — дизайн

**Дата:** 2026-07-27
**Статус:** утверждён к реализации (вариант A — без UI, срез по запросу)
**Ветка:** `feature/emergency-block-tracking`

## Зачем

ЧП-блок LIVE с 2026-07-24 ([[project_emergency_warehouse_crisis_block]]). Спрос по урокам виден из `LessonProgress`, но **не измеряется**: (1) источник входа — баннер витрины vs пин каталога решений (обе ссылки ведут на один URL без метки), (2) показы/CTR блока. Метрика не ловит in-app SPA-переходы на страницу джобы. Нужен собственный лёгкий захват событий.

## Что ловим

2 поверхности × 2 события:
- `surface`: `BANNER` (витрина `/dashboard`) | `PIN` (каталог `/learn/solutions`, WB)
- `kind`: `IMPRESSION` (компонент отрисовался) | `CLICK` (клик по блоку)

Источник входа известен в самом компоненте — параметр `?from=` НЕ нужен.

## Хранилище

Новая таблица-счётчик (калька `ReferralCodeClickDay`), без PII:

```prisma
model EmergencyBlockEventDay {
  surface   String   // BANNER | PIN
  kind      String   // IMPRESSION | CLICK
  day       DateTime @db.Date
  count     Int      @default(0)
  createdAt DateTime @default(now())
  @@id([surface, kind, day])
  @@index([day])
}
```

Миграция — **аддитивная, forward-only, через Supabase Mgmt API** (правило проекта: localhost dev читает прод; `prisma migrate/push` против этой БД ЗАПРЕЩЁН). `CREATE TABLE IF NOT EXISTS` + индекс. Модель добавляется в `schema.prisma` + `prisma generate` (клиент), DDL применяется вручную Mgmt-скриптом.

## Запись

tRPC-мутация `job.recordEmergencyEvent({ surface, kind })` (`protectedProcedure`), вызывается fire-and-forget из клиентских компонентов:
- `EmergencyBanner`: `IMPRESSION` при монтировании (один раз — guard от double-fire React 18), `CLICK` в `onClick`.
- `EmergencyFeaturedCard`: то же с `surface=PIN`.

Upsert day-счётчика (UTC-день, как в `ref-click`).

**Гард от staging (общая БД):** запись только когда `process.env.EMERGENCY_TRACK_ENABLED === 'true'` (ставим ТОЛЬКО на проде; staging делит ту же БД и завысил бы счётчик — как fail-closed `REF_CLICK_SECRET`). Мутация при флаге off — тихий no-op.

Зод-валидация входа: `surface ∈ {BANNER,PIN}`, `kind ∈ {IMPRESSION,CLICK}` (z.enum — отсекает мусор до БД).

## Отчёт (вариант A — без UI)

UI не строим (блок временный). Срез — по запросу через committed-скрипт `scripts/crisis-job-stats.ts` (промоут ad-hoc из сессии 2026-07-27): читает `EmergencyBlockEventDay` + `LessonProgress` по 3 урокам джобы и печатает воронку:

`показ → клик → CTR` (по каждой поверхности) → `открыл урок → досмотрел`.

## Раскатка

Через staging (сборка/визуал), затем прод. На проде — выставить `EMERGENCY_TRACK_ENABLED=true` в `.env.production` + `up -d web`. Kill-switch трекинга — та же переменная в `false`.

## Вне scope

- Уникальные пользователи по показам (day-счётчик агрегатный; при необходимости позже — per-event строки).
- Admin-UI (вариант B отклонён).
- Изменение самого ЧП-блока / его флага `EMERGENCY_BANNER_ENABLED`.
