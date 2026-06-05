---
status: passed
phase: 61-learning-2-0
source: [61-VERIFICATION.md]
started: "2026-06-03T15:15:00Z"
updated: "2026-06-05T08:55:05Z"
---

## Current Test

Все пункты проверены owner на staging + prod (2026-06-05). Обучение 2.0 в проде (release 4145a68), без замечаний.

## Tests

### 1. Навигация desktop/mobile
expected: Desktop — сабменю «Обучение» разворачивается в sidebar с подсветкой активного из 4 пунктов; mobile — LearningTabs горизонтальный таб-стрип виден вверху страниц /learn/*
result: passed (owner, 2026-06-05)

### 2. Контекстный поиск — Решения под задачу
expected: На /learn/solutions запрос → Enter возвращает только job-карточки (playbooks) с кнопкой «В план»; никаких уроков/материалов
result: passed (owner, 2026-06-05)

### 3. Контекстный поиск — База знаний
expected: На /learn/library запрос → сгруппированные секции «Уроки» (LessonResultCard) и «Материалы» (MaterialCard); при пустом запросе виден каталог курсов + material catalog
result: passed (owner, 2026-06-05)

### 4. Каталог материалов + фильтр по типу
expected: Чипы типов (5 + «Уроки») фильтруют список материалов; пустой результат → «Материалов этого типа пока нет»
result: passed (owner, 2026-06-05)

### 5. FavoriteButton (сердечко) на карточках
expected: Клик по сердечку на JobCard/MaterialCard/LessonResultCard → оптимистично розовеет (mp-pink-500); элемент появляется в /learn/favorites с кнопкой удаления
result: passed (owner, 2026-06-05)

### 6. План = только диагностика, Избранное = мигрированные добавления
expected: /learn/plan без секции «Мои уроки» (только errors/deepening/growth/advanced); /learn/favorites показывает бывшие ручные добавления (часть от мигрированных 718 строк / 24 юзера). Проверять на аккаунте из мигрированных юзеров.
result: passed (owner, 2026-06-05)

### 7. Дашборд 3 входа
expected: Вверху /dashboard — 3 акцентных карточки («Продолжить мой план» soft-blue → /learn/plan, «Найти быстрый ответ» soft-green → /learn/library, «Решить задачу» gradient → /learn/solutions); статы condensed
result: passed (owner, 2026-06-05)

### 8. Онбординг-тур (desktop + mobile)
expected: Тур не показывает «element not found»; шаг «Обучение» находит data-tour=learn-submenu (desktop sidebar), шаг «Поиск» — data-tour=learn-search (hero).
result: passed (owner, 2026-06-05) — FIXED 2026-06-03 (commit 6b7b0df): добавлен data-tour=learn-submenu в мобильный LearningTabs. Осталось визуально подтвердить тур на mobile после деплоя.

### 9. E2E Playwright learn-redirect (credential gate)
expected: /learn/track → /learn/plan; /learn → /learn/plan|/learn/library. Запуск: `TEST_USER_EMAIL=tester@mpstats.academy TEST_USER_PASSWORD=<из .secrets/e2e-credentials.md> npx playwright test learn-redirect`.
result: passed (owner, 2026-06-05) — FIXED 2026-06-03 (commit 67c260b): тест читает креды из env (TEST_USER_EMAIL/TEST_USER_PASSWORD), skip если не заданы. Креды tester@/test@ ПРОВЕРЕНЫ рабочими vs prod auth (HTTP 200), лежат в .secrets/e2e-credentials.md. Осталось прогнать e2e на staging (нужен запущенный сервер с полным env).

## Summary

total: 9
passed: 9
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps
