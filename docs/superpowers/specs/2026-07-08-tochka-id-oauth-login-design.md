# Design — «Войти через Точку» (Tochka ID OAuth login)

**Date:** 2026-07-08
**Status:** Approved (design) — ready for implementation plan
**Author:** Claude Code (brainstorm с owner)

## Проблема

Домен `@tochka.com` не доставляет DOI-письма CarrotQuest (корпоративный фильтр на отправителя). Итог: клиенты и сотрудники Точки, регистрирующиеся по email, не могут подтвердить почту и войти. За 2026-07 обнаружено: из 3 аккаунтов `@tochka.com` **сами не подтвердились 0** — каждый приходилось подтверждать вручную через Mgmt API (лечение симптома). См. память `project_tochka_doi_deliverability.md`.

Точка — стратегический партнёр (КП-проект `go.mpstats.academy`), поток клиентов Точки ожидается. Ручное подтверждение не масштабируется.

## Решение

Добавить на платформу опцию входа/регистрации **через Tochka ID (OAuth/OIDC)** по образцу существующего входа через Яндекс. OAuth-пользователь создаётся сразу подтверждённым (`email_confirm: true`) — **письмо DOI не участвует вообще**, проблема доставляемости обходится системно.

Интеграция **переиспользует уже готовый** OIDC-клиент Точки из `go.mpstats.academy` (`lib/auth/tochka.ts`, Phase 13) — там уже решён самый хрупкий кусок (обход антибота Variti WAF, формат scope, Basic-auth). Redirect URI платформы (`https://platform.mpstats.academy/api/auth/tochka/callback`) уже зарегистрирован Точкой на том же `client_id`, что и go.mpstats.

## Goals

- Кнопка «Войти через Точку» на `/login` и `/register`.
- Вход через Tochka ID создаёт/находит пользователя в Supabase Auth и выдаёт сессию — как Яндекс.
- Новый пользователь создаётся подтверждённым (без DOI), с телефоном из профиля Точки.
- Полный паритет с Яндекс-флоу по побочным эффектам (базовый триал, реферальный хук).
- Безопасный роллаут за env-флагом.

## Non-goals (YAGNI)

- Хранение/обновление refresh-token Точки (мы минтим собственную Supabase-сессию, доступ к API Точки после входа не нужен).
- Гейт входа на `email_verified` (owner выбрал паритет с Яндексом — вход всегда по email).
- Связь с партнёрским входом (`/api/partner/mpstats/enter`) и партнёрскими курсами.
- Доп. поля профиля из Точки, кроме телефона.
- Отдельный OAuth-клиент для платформы (переиспользуем клиент go.mpstats).

## Принятые решения

| Вопрос | Решение | Обоснование |
|---|---|---|
| Связывание аккаунтов при существующем email | **Всегда логинить в существующий по `lower(email)`** | Паритет с Яндекс-колбэком; `email_verified` сохраняем в метаданные для аудита, но вход не гейтит |
| Роллаут кнопки | **За env-флагом `TOCHKA_LOGIN_ENABLED`** | Безопасный вывод auth-фичи: ship dark → staging → флип прод-флага (паттерн PARTNER_ENTRY) |
| Точка не вернула email | **Редирект `/login?error=tochka_no_email`** | email — ключ аккаунта; синтетический подставлять нельзя |
| CSRF-state | Рандомная httpOnly-кука (как Яндекс) | Партнёрский контекст не нужен → signed-state из go.mpstats не тащим |
| OAuth-клиент | Общий с go.mpstats (`client_id=245da9…`, тот же secret) | Redirect уже зареган на этот клиент; secret берём из env go.mpstats |

## Архитектура

Кастомный OAuth-флоу (не Supabase-native), зеркалит существующий Яндекс: `apps/web/src/app/api/auth/yandex/callback/route.ts` — это эталон.

### Компоненты

**1. OIDC-клиент** `apps/web/src/lib/auth/tochka.ts` (порт из go.mpstats, verbatim-логика):
- `buildAuthorizeUrl(state)` — authorize-URL, scope `openid,customers` (через запятую — квирк Точки).
- `exchangeCodeForToken(code)` — POST /token, client_secret в Basic-auth заголовке.
- `fetchUserInfo(accessToken)` — GET /user_info → `{ sub, email, email_verified, phone_number, phone_number_verified, given_name, family_name, name }`.
- `tochkaFetch(url, init)` — обёртка обхода Variti WAF (browser-UA + cookie-handshake на 307).
- `TochkaError` (коды: `invalid_state | token_exchange_failed | user_info_failed | timeout | missing_env | unknown`).
- Все внешние вызовы — 8s `AbortSignal.timeout`. Токены НЕ логировать.
- Env: `TOCHKA_CLIENT_ID`, `TOCHKA_CLIENT_SECRET`, `TOCHKA_REDIRECT_URI`, `TOCHKA_SSO_BASE_URL` (дефолт `https://id.tochka.com/api/v1/tochka-id/auth/v1/sso`), `TOCHKA_SCOPE` (дефолт `openid,customers`).

**2. Роуты** `apps/web/src/app/api/auth/tochka/`:
- `authorize/route.ts` (GET):
  1. Гейт: `TOCHKA_LOGIN_ENABLED !== 'true'` → редирект `/login`.
  2. Сгенерировать рандомный `state` → httpOnly+secure+sameSite=lax кука `tochka_oauth_state` (path ограничить `/api/auth/tochka`).
  3. (Опц.) сохранить `next` из query в куку/state для пост-логин редиректа.
  4. Редирект на `buildAuthorizeUrl(state)`.
- `callback/route.ts` (GET) — 1:1 с Яндекс-колбэком, отличия помечены:
  1. Гейт `TOCHKA_LOGIN_ENABLED`.
  2. Прочитать `code`, `state`; нет `code` → `/login?error=missing_code`.
  3. CSRF: `state` из query === кука `tochka_oauth_state`; иначе → `/login?error=invalid_state`. Удалить куку (one-time).
  4. `exchangeCodeForToken(code)` → `fetchUserInfo(accessToken)`.
  5. **Нет `email` → `/login?error=tochka_no_email`.** (Отличие от Яндекса.)
  6. Поиск по `SELECT id::text, email FROM auth.users WHERE lower(email)=lower(:email) LIMIT 1` (raw SQL — как в Яндекс-колбэке, из-за пагинации `listUsers` и casing-инцидентов).
  7. Существующий → бэкафилл `user_metadata.{tochka_id, full_name}`; новый → `createUser({ email, email_confirm:true, user_metadata:{ tochka_id:sub, full_name, tochka_email_verified, tochka_phone_verified } })`.
  8. Сессия: `generateLink({type:'magiclink', email})` → `verifyOtp({token_hash, type:'magiclink'})` → `setSession` через `createServerClient` в редирект-ответ.
  9. `UserProfile.upsert`: `tochkaId=sub`, `phone` (если Точка вернула `phone_number`), `name`.
  10. Новый пользователь: `ensureBaseTrial` ИЛИ реферальный хук (`issueReferralOnSignup` по реф-куке) — как у Яндекса.
  11. Редирект: новый без телефона → `/complete-profile`, иначе → `next` || `/dashboard`.
  12. Любая `TochkaError`/исключение → `/login?error=<code|auth_callback_error>`, в Sentry. **Никогда не 500 юзеру.**

**3. UI** — кнопка «Войти через Точку» (ссылка на `/api/auth/tochka/authorize`) на `/login` и `/register`, стилистически рядом с кнопкой Яндекса. Логотип Точки (SVG из brand-assets / go.mpstats). Видимость: страница — серверный компонент, читает `process.env.TOCHKA_LOGIN_ENABLED` в рантайме и прокидывает проп `showTochka` в клиентскую форму (флип без пересборки; НЕ через `NEXT_PUBLIC_*`).

**4. Схема** — аддитивная миграция: `UserProfile.tochkaId String?` (зеркало `yandexId`; nullable, без бэкафилла). Нужна для связки и для логики формы смены пароля в `/profile` (OAuth-юзеры без пароля). Применяется к прод-Supabase через Mgmt API (паттерн `reference_supabase_migration_via_mgmt_api.md`, только additive).

**5. Env (MAAL)** — добавить в `.env` / `docker-compose.yml`:
```
TOCHKA_CLIENT_ID=245da9d0f5564ac8aca0a3528f720078
TOCHKA_CLIENT_SECRET=<из прод-env go.mpstats — тот же клиент; в чат/коммиты НЕ писать>
TOCHKA_REDIRECT_URI=https://platform.mpstats.academy/api/auth/tochka/callback
TOCHKA_LOGIN_ENABLED=false   # ship dark; true на staging и при go-live
# TOCHKA_SSO_BASE_URL=       # дефолт
```

### Data flow

```
[/login|/register] кнопка (showTochka)
   → GET /api/auth/tochka/authorize  (флаг + state-кука)
   → id.tochka.com/authorize  (Точка логинит пользователя)
   → GET /api/auth/tochka/callback?code&state
        state OK → exchangeCodeForToken → fetchUserInfo
        email? → find auth.users by lower(email)
                 existing → link;  new → createUser(email_confirm:true)
        → generateLink(magiclink)+verifyOtp → setSession (cookies)
        → UserProfile.upsert(tochkaId, phone);  new → trial/referral
   → redirect /dashboard  (или /complete-profile, или /login?error=…)
```

## Обработка ошибок

- Все ошибки колбэка → редирект `/login?error=<code>`; коды: `missing_code`, `invalid_state`, `tochka_no_email`, `token_exchange_failed`, `user_info_failed`, `timeout`, `auth_callback_error`. В Sentry с тегами `route: 'tochka-callback', stage`.
- WAF-хендшейк и таймауты — внутри `tochkaFetch`/клиента.
- Гейт-флаг off → тихий редирект на `/login` (роуты инертны).

## Тестирование

- **Юнит** (Vitest, по образцу Яндекс-тестов): ветки колбэка — новый юзер / существующий (линк) / нет email / невалидный state — с моком клиента Точки и Supabase admin.
- **Клиентские** (порт из go.mpstats): `buildAuthorizeUrl` (scope-формат), обработка ошибок токен/юзеринфо, WAF-хендшейк на 307.
- **E2E** — ручной на staging с реальным Tochka ID (флаг on на staging): вход новым tochka-аккаунтом → создан подтверждённым, сессия, телефон; вход существующим email → линк.
- Регресс: Яндекс/email-вход не затронуты.

## Роллаут

1. Реализация в изолированном worktree, миграция `tochkaId` через Mgmt API (additive).
2. Deploy dark: `TOCHKA_LOGIN_ENABLED=false` на проде (роуты и кнопка инертны).
3. Staging: `TOCHKA_LOGIN_ENABLED=true` + креды Точки → E2E реальной Точкой.
4. Go-live: флип `TOCHKA_LOGIN_ENABLED=true` на проде (runtime env, без пересборки).
- **Откат:** флаг → `false` (мгновенно скрывает кнопку + инертит роуты) либо `git revert` мержа.

## Prerequisites (статус)

- ✅ Redirect `https://platform.mpstats.academy/api/auth/tochka/callback` зарегистрирован Точкой (Arthur, 2026-07-08) на `client_id=245da9d0f5564ac8aca0a3528f720078`, prod-слой.
- ⏳ `TOCHKA_CLIENT_SECRET` — скопировать из прод-env go.mpstats (тот же клиент).
- ⏳ Подтвердить у Точки, что go.mpstats-клиент — на **боевом** слое (если это был sandbox — нужны боевые креды).
- ⏳ SVG-логотип Точки для кнопки (из brand-assets / go.mpstats).

## Эталонные файлы

- `apps/web/src/app/api/auth/yandex/callback/route.ts` — эталон колбэка (find/create, magiclink-сессия, phone, trial/referral).
- `apps/web/src/lib/auth/oauth-providers.ts` — структура Яндекс-провайдера.
- `go.mpstats.academy/lib/auth/tochka.ts` — исходник OIDC-клиента для порта.
- `packages/db/prisma/schema.prisma` → `UserProfile.yandexId` — образец для `tochkaId`.
