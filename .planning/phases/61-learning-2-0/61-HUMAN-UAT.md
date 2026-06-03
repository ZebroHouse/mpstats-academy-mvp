---
status: partial
phase: 61-learning-2-0
source: [61-VERIFICATION.md]
started: "2026-06-03T15:15:00Z"
updated: "2026-06-03T15:15:00Z"
---

## Current Test

[awaiting human testing]

## Tests

### 1. Навигация desktop/mobile
expected: Desktop — сабменю «Обучение» разворачивается в sidebar с подсветкой активного из 4 пунктов; mobile — LearningTabs горизонтальный таб-стрип виден вверху страниц /learn/*
result: [pending]

### 2. Контекстный поиск — Решения под задачу
expected: На /learn/solutions запрос → Enter возвращает только job-карточки (playbooks) с кнопкой «В план»; никаких уроков/материалов
result: [pending]

### 3. Контекстный поиск — База знаний
expected: На /learn/library запрос → сгруппированные секции «Уроки» (LessonResultCard) и «Материалы» (MaterialCard); при пустом запросе виден каталог курсов + material catalog
result: [pending]

### 4. Каталог материалов + фильтр по типу
expected: Чипы типов (5 + «Уроки») фильтруют список материалов; пустой результат → «Материалов этого типа пока нет»
result: [pending]

### 5. FavoriteButton (сердечко) на карточках
expected: Клик по сердечку на JobCard/MaterialCard/LessonResultCard → оптимистично розовеет (mp-pink-500); элемент появляется в /learn/favorites с кнопкой удаления
result: [pending]

### 6. План = только диагностика, Избранное = мигрированные добавления
expected: /learn/plan без секции «Мои уроки» (только errors/deepening/growth/advanced); /learn/favorites показывает бывшие ручные добавления (часть от мигрированных 718 строк / 24 юзера). Проверять на аккаунте из мигрированных юзеров.
result: [pending]

### 7. Дашборд 3 входа
expected: Вверху /dashboard — 3 акцентных карточки («Продолжить мой план» soft-blue → /learn/plan, «Найти быстрый ответ» soft-green → /learn/library, «Решить задачу» gradient → /learn/solutions); статы condensed
result: [pending]

### 8. Онбординг-тур (desktop + mobile)
expected: Тур не показывает «element not found»; шаг «Обучение» находит data-tour=learn-submenu (desktop sidebar), шаг «Поиск» — data-tour=learn-search (hero).
result: [pending] — FIXED 2026-06-03 (commit 6b7b0df): добавлен data-tour=learn-submenu в мобильный LearningTabs. Осталось визуально подтвердить тур на mobile после деплоя.

### 9. E2E Playwright learn-redirect (credential gate)
expected: /learn/track → /learn/plan; /learn → /learn/plan|/learn/library. Запуск: `TEST_USER_EMAIL=tester@mpstats.academy TEST_USER_PASSWORD=<из .secrets/e2e-credentials.md> npx playwright test learn-redirect`.
result: [pending] — FIXED 2026-06-03 (commit 67c260b): тест читает креды из env (TEST_USER_EMAIL/TEST_USER_PASSWORD), skip если не заданы. Креды tester@/test@ ПРОВЕРЕНЫ рабочими vs prod auth (HTTP 200), лежат в .secrets/e2e-credentials.md. Осталось прогнать e2e на staging (нужен запущенный сервер с полным env).

## Summary

total: 9
passed: 0
issues: 0
pending: 9
skipped: 0
blocked: 0

## Gaps
