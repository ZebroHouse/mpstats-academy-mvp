---
phase: 60-ambassador-codes
plan: 04
status: pending
created: 2026-05-28
---

# Phase 60 — Human UAT Checklist

Manual UAT scenarios for the Ambassador Codes feature. Run all 9 against **staging.platform.mpstats.academy** before approving prod migration. Re-run scenarios 1, 6, 8, 9 on prod after deploy as a smoke pass.

## Pre-conditions

- [ ] Staging deployed from branch `phase-60-ambassador-codes` (per `60-DEPLOY-RUNBOOK.md` step 2).
- [ ] Migration `20260528000000_add_referral_code_table` applied to **staging Supabase** (verified via `_prisma_migrations`).
- [ ] Admin user (Role.ADMIN or SUPERADMIN) credentials available.
- [ ] At least one throwaway email + phone available (Mailosaur, temp-mail, or controlled inbox).
- [ ] Basic-auth `team` creds available for staging.

---

## Scenario 1 — Happy path: admin creates AMB-UAT01, friend activates, trial granted

| # | Step | Expected |
|---|------|----------|
| 1 | Admin opens `/admin/referrals/codes`, clicks «+ Создать код» | Dialog opens |
| 2 | Fill: `code=AMB-UAT01`, `label=UAT happy path`, `refereeTrialDays=1`, leave `maxUses` empty, leave `expiresAt` empty | All fields accepted |
| 3 | Submit | Toast «Код создан», row `AMB-UAT01` appears with activations=0 |
| 4 | Copy share link from row → `https://staging.platform.mpstats.academy/register?ref=AMB-UAT01` | Link copies to clipboard |
| 5 | Open **incognito + different network** (4G hotspot or VPN) | Avoids cookie + IP leak |
| 6 | Visit copied link | `/register?ref=AMB-UAT01` loads, banner shows «+1 день» (or similar copy) |
| 7 | Register fresh email + phone, submit | Confirm-email page appears |
| 8 | Open inbox, click DOI link | Lands on `/auth/confirm` → onboarding/welcome |
| 9 | Navigate to `/profile` | Section «Подписка»: status TRIAL, активна до <today + 1 day> |
| 10 | Return to admin `/admin/referrals/codes`, check `AMB-UAT01` row | activations = 1, paid_conversions = 0 |

- [ ] **Scenario 1 PASS** — happy path end-to-end

## Scenario 2 — Limit: `maxUses=1` blocks second activation

| # | Step | Expected |
|---|------|----------|
| 1 | Admin creates `AMB-UAT02` with `maxUses=1`, `refereeTrialDays=1` | Row appears |
| 2 | Activate via incognito #1 (new email A) → register + DOI | Trial granted, activations=1 |
| 3 | Activate via incognito #2 (new email B) → register + DOI | NO trial granted (status NONE / no subscription) |
| 4 | Admin row check | `currentUses=1` still, paid_conversions unchanged |
| 5 | Sentry filter `referral.ambassador.limit_hit` | Event present for user B |

- [ ] **Scenario 2 PASS** — `maxUses` hard limit enforced

## Scenario 3 — Limit: `expiresAt` in the past blocks activation

| # | Step | Expected |
|---|------|----------|
| 1 | Admin creates `AMB-UAT03` with `refereeTrialDays=1`, `expiresAt=<NOW + 5 minutes>` via UI date picker | Row appears |
| 2 | Wait 6 minutes (or use SQL `UPDATE "ReferralCode" SET "expiresAt"=NOW() - INTERVAL '1 hour' WHERE code='AMB-UAT03'`) | Code now expired |
| 3 | Try to activate via incognito + DOI | NO trial granted |
| 4 | Sentry `referral.ambassador.expired` event present | One event |

- [ ] **Scenario 3 PASS** — `expiresAt` gate enforced

## Scenario 4 — Limit: `isActive=false` blocks activation

| # | Step | Expected |
|---|------|----------|
| 1 | Admin creates `AMB-UAT04`, refereeTrialDays=1 | Row appears |
| 2 | Admin clicks «Деактивировать» on the row | Row updates, status indicator shows inactive |
| 3 | Try to activate via incognito + DOI | NO trial granted |
| 4 | Sentry `referral.ambassador.inactive` event present | One event |

- [ ] **Scenario 4 PASS** — `isActive=false` gate enforced

## Scenario 5 — D-03: stale logged-in user visiting link does NOT alter state

| # | Step | Expected |
|---|------|----------|
| 1 | Admin creates `AMB-UAT05`, refereeTrialDays=1 | Row appears |
| 2 | Copy share link | OK |
| 3 | Sign in to existing `tester@mpstats.academy` account on staging | Logged in normally |
| 4 | Visit share link (logged in) | `/register` redirects logged-in user to `/learn` per 53A auth-guard |
| 5 | Check `tester@mpstats.academy` /profile | No new TRIAL Subscription, existing subscription untouched |
| 6 | Check `AMB-UAT05` row in admin | currentUses=0, activations=0 |
| 7 | Sentry `referral.ambassador.stale_user` event present | One event |

- [ ] **Scenario 5 PASS** — stale-user no-op confirmed (D-03 invariant)

## Scenario 6 — Cross-table collision blocked

| # | Step | Expected |
|---|------|----------|
| 1 | Find any existing `UserProfile.referralCode` value (REF-XXXXXX) via Supabase SQL | Got value |
| 2 | Admin tries to create AMBASSADOR code with that same value via UI | Error toast «Код уже занят» / CONFLICT, dialog stays open |
| 3 | Admin retries with a fresh unique code (`AMB-UAT06`) | Succeeds |

- [ ] **Scenario 6 PASS** — cross-table collision (ReferralCode.code ↔ UserProfile.referralCode) blocked

## Scenario 7 — Phase 53A regression: user-to-user referral still works

| # | Step | Expected |
|---|------|----------|
| 1 | Sign in to existing user A on staging | OK |
| 2 | Navigate to `/profile/referral`, copy REF-XXXXXX share link | OK |
| 3 | Incognito + DIFFERENT email registers via that link → DOI | Trial granted to friend B |
| 4 | Friend B `/profile` shows 14-day trial active | OK |
| 5 | Check `Referral` row in DB: `codeType=USER`, `referrerUserId=<A id>`, `referredUserId=<B id>` | All fields match (codeType is USER, not AMBASSADOR) |
| 6 | Bonus package logic per `referral_pay_gated` flag flow unchanged | OK |

- [ ] **Scenario 7 PASS** — 53A flow intact (no regression from 60)

## Scenario 8 — CQ events fire for ambassador signup

| # | Step | Expected |
|---|------|----------|
| 1 | Open CarrotQuest dashboard, search lead by Scenario 1 friend email | Lead found |
| 2 | Inspect lead properties | `pa_referral_source` contains label «UAT happy path» (or code `AMB-UAT01`), `pa_referral_trial_days=1` |
| 3 | Inspect lead events | Event `pa_ambassador_signup` fired once with timestamp matching DOI confirm |

- [ ] **Scenario 8 PASS** — CQ mirror present for ambassador-driven signups

## Scenario 9 — Smoke after PROD deploy (Checkpoint B follow-up)

Run on **prod** (`https://platform.mpstats.academy`) after migration + code deploy:

| # | Step | Expected |
|---|------|----------|
| 1 | Admin opens `/admin/referrals/codes` on prod | Page loads, table renders |
| 2 | Create `AMB-PROD-SMOKE-01` with `maxUses=1`, `refereeTrialDays=1` | Row appears |
| 3 | Activate via incognito throwaway email + DOI | Trial granted, activations=1 |
| 4 | Verify `_prisma_migrations` row `20260528000000_add_referral_code_table` exists with `finished_at` set | Confirmed via psql or Supabase SQL editor |
| 5 | Delete the smoke code via SQL: `DELETE FROM "ReferralCode" WHERE code='AMB-PROD-SMOKE-01';` (or via admin UI if delete is exposed) | Row removed |

- [ ] **Scenario 9 PASS** — prod smoke green

---

## UAT Summary

- total: 9
- passed: 0
- issues: 0
- pending: 9

After all 9 boxes are ticked, signal the executor to resume via `uat-passed`. Any failure → report which scenario + symptom; executor fixes code; re-deploy staging; re-run failed scenario.
