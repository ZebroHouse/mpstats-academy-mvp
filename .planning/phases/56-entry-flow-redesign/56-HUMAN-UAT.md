---
status: partial
phase: 56-entry-flow-redesign
source: [56-VERIFICATION.md]
started: 2026-05-18T11:38:07Z
updated: 2026-05-18T11:38:07Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Yandex OAuth — новый аккаунт попадает в `/welcome`
expected: Свежий вход через Yandex OAuth (аккаунт без строки `UserProfile`) — гард `(main)`-layout редиректит на `/welcome`-визард, а не на `(main)`-роут. Проверяет исправленное условие `if (!profile || profile.onboardingCompletedAt === null)`.
result: [pending]

### 2. E2E `phase-56-entry-flow.spec.ts` в CI/staging
expected: E2E-спека проходит функциональный прогон в CI или на staging с реальными тест-кредами (`TEST_NEW_USER_EMAIL` + `TEST_NEW_USER_PASSWORD`). В sandbox прогон невозможен из-за pre-existing сбоя авторизации тест-юзера Supabase (не дефект этой фазы — см. `56-03-SUMMARY.md`, `deferred-items.md`).
result: [pending]

## Summary

total: 2
passed: 0
issues: 0
pending: 2
skipped: 0
blocked: 0

## Gaps
