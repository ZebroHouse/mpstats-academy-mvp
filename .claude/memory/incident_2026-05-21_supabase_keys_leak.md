---
name: incident_2026-05-21_supabase_keys_leak
description: 2026-05-21 — service_role JWT утёк в git history MAAL → ротация постгрес-пароля + миграция всех проектов на sb_publishable_/sb_secret_ ключи
type: incident
---

# Incident — Supabase service_role JWT leak in MAAL git history (2026-05-21)

## What leaked

В коммите `76356cf` ("docs(phase-55): Sprint 2 implementation plan") был запушен файл `docs/superpowers/plans/2026-05-07-phase-55-sprint-2-pilot.md`, строка 1604, где в shell-command example стоял **живой** `SUPABASE_SERVICE_ROLE_KEY` (полный JWT) проекта `saecuecevicwjkpmaoot`, а не placeholder.

```
SUPABASE_SERVICE_ROLE_KEY='eyJhbGc...REDACTED...' \
```

`role: service_role`, `exp: 2081838299` (~2035). Полный bypass RLS на shared Supabase MAAL/go_mpstats.

**Triggered by:** owner также обнаружил параллельно, что в `go_mpstats` (`/home/deploy/go-app/scripts/*.ts`) postgres-пароль роли `postgres` (`<old-postgres-password>`) был захардкожен в 12+ файлах. Двойная утечка через один Supabase проект.

## How it happened

AI-агент в сессии 2026-05-07 писал implementation-plan для Phase 55 Sprint 2 (vision RAG ingest). В шагах плана нужны были shell-команды вида `SUPABASE_SERVICE_ROLE_KEY=... pnpm tsx scripts/...`. Для "конкретики" агент подставил **реальное значение** ключа вместо placeholder'а `<your-key>`.

Документ закоммитился вместе с другими plan-файлами. Никакой pre-commit secret-scanner не сработал.

Существующее правило `NEVER commit to git: API keys, ...` в global `CLAUDE.md` присутствовало, но психологически не сработало — агент воспринял plan-документ как "методичку для будущего себя", не как "конфиг для прода".

## What was done (2026-05-21 session)

1. **Postgres пароль ротирован** в Supabase Dashboard → Database → Reset password. Старый `<old-postgres-password>` → новый `<new-postgres-password>`. Обновлён везде:
   - MAAL локальные .env (3 файла)
   - MAAL VPS .env.production + .env.staging (контейнеры пересозданы)
   - MAAL VPS backup-cron .env (`/home/deploy/maal-backup/.env`)
   - go_mpstats код (refactor: пароль из хардкода → env, делала параллельная сессия в коммите `d23e1ba`)
   - go_mpstats VPS .env + .env.local
   - academy-marketing-agent VPS .env

2. **Создана новая пара API ключей** в Supabase Dashboard → Settings → API:
   - `<new-publishable-key>` (replaces legacy `anon`)
   - `<new-secret-key>` (replaces legacy `service_role`)

3. **Полная миграция MAAL + go_mpstats на новые ключи** (rename env vars + rotate values):
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` → `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` → `SUPABASE_SECRET_KEY`
   - `SUPABASE_ANON_KEY` (bare, keepalive workflow) → `SUPABASE_PUBLISHABLE_KEY`
   - MAAL: 26 файлов, master `4cfeee8`. Прод + staging rebuilt + redeployed, healthy.
   - go_mpstats: 8 файлов, master `75e96dd`. Деплой на VPS go-app.
   - MAAL worktree `phase-57-library-redesign`: только значения (имена не тронуты, бранч в работе).
   - academy-marketing-agent: только значение (минимальная инвазия в чужой проект).

4. **Legacy JWT-based API keys revoked** в Supabase Dashboard → Settings → API → "Disable JWT-based API keys". После этого утёкший в git history `eyJhbGc...` JWT стал мёртвым.

5. GitHub Actions secrets обновлены (`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_PUBLISHABLE_KEY` для keepalive workflow).

## Why we migrated naming, not just rotated values

Supabase официально объявил deprecation legacy `anon`/`service_role` JWT — обязательная миграция к **концу 2026**. Имея вынужденную ротацию из-за утечки, сделали миграцию формата ключей в одно действие, чтобы не делать это второй раз через 6 месяцев.

Источник дат: https://supabase.com/blog/jwt-signing-keys (объявлено 2025-07-14, mandatory deadline late 2026).

## Prevention going forward

Главное правило (см. global `~/.claude/CLAUDE.md` секция Security & Credentials): **в любом коммитимом файле — README, plan, ADR, CLAUDE.md, code comment, git issue, PR description — на месте секрета всегда placeholder**. AI-агент должен видеть в этом trigger даже при написании "просто документации".

Если планируешь поставить pre-commit hook со secret-scanner (`gitleaks`) — это самый надёжный механический барьер на будущее. Сейчас не поставлен.

CI bundle-leak scanner в MAAL (`.github/workflows/ci.yml` job `build`) сканирует `apps/web/.next/static/` на `SUPABASE_SERVICE_ROLE` — ловит ТОЛЬКО утечку в клиент-бандл (через ошибочный импорт admin-клиента в client component). НЕ ловит утечку в plan/docs/README — это другой класс утечек.

## Related

- `~/.claude/projects/D--GpT-docs/memory/feedback_vault_secret_leak.md` — другая утечка (Obsidian vault, auto-cron). Разный механизм, тот же класс мистейков.
- `feedback_prisma_shared_db_disaster.md` — другой prod-инцидент в этом же Supabase проекте.
