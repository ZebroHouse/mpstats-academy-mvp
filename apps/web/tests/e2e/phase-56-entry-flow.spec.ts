import { test, expect, type Page } from '@playwright/test';

/**
 * Phase 56 — Entry Flow Redesign E2E
 *
 * The wizard only shows for users with onboardingCompletedAt == null.
 * After ~200 prod users are migrated they all see it once; in tests we need
 * a fresh user that has never passed the wizard.
 *
 * Required env (set when running the full wizard scenario):
 *   - TEST_NEW_USER_EMAIL / TEST_NEW_USER_PASSWORD   user with onboardingCompletedAt == null
 *
 * The new-user scenarios skip automatically when env is not set.
 * The "no repeat" scenario uses the standard tester (already onboarded).
 */

const NEW_EMAIL = process.env.TEST_NEW_USER_EMAIL;
const NEW_PASSWORD = process.env.TEST_NEW_USER_PASSWORD;
const haveNewUser = Boolean(NEW_EMAIL && NEW_PASSWORD);

const TESTER_EMAIL = 'tester@mpstats.academy';
const TESTER_PASSWORD = 'TestUser2024';

async function login(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
}

async function completeWizard(page: Page) {
  // Step 1 — Цели
  await expect(page.getByText(/Зачем вы пришли в Академию\?/i)).toBeVisible({
    timeout: 15000,
  });
  await page.getByRole('button', { name: /Увеличить продажи/i }).click();
  await page.getByRole('button', { name: /Продолжить/i }).click();

  // Step 2 — Маркетплейсы
  await expect(
    page.getByText(/На каких маркетплейсах вы работаете\?/i),
  ).toBeVisible();
  await page.getByRole('button', { name: /Wildberries/i }).click();
  await page.getByRole('button', { name: /Далее/i }).click();

  // Step 3 — Опыт
  await expect(
    page.getByText(/Какой у вас опыт на маркетплейсах\?/i),
  ).toBeVisible();
  await page.getByRole('button', { name: /Новичок/i }).click();
  await page.getByRole('button', { name: /Далее/i }).click();

  // Fork
  await expect(page.getByText(/мы готовы помочь вам расти/i)).toBeVisible();
}

test.describe('Phase 56 — entry flow', () => {
  test('new user is redirected to /welcome and can finish via «Перейти в обучение»', async ({
    page,
  }) => {
    test.skip(!haveNewUser, 'TEST_NEW_USER env not set');

    await login(page, NEW_EMAIL!, NEW_PASSWORD!);
    // (main) guard bounces a non-onboarded user to /welcome
    await page.waitForURL(/\/welcome/, { timeout: 15000 });

    await completeWizard(page);

    await page.getByRole('button', { name: /Перейти в обучение/i }).click();
    await page.waitForURL(/\/learn/, { timeout: 15000 });
  });

  test('new user can finish via «Пройти диагностику»', async ({ page }) => {
    test.skip(!haveNewUser, 'TEST_NEW_USER env not set');

    await login(page, NEW_EMAIL!, NEW_PASSWORD!);
    await page.waitForURL(/\/welcome/, { timeout: 15000 });

    await completeWizard(page);

    await page.getByRole('button', { name: /Пройти диагностику/i }).click();
    await page.waitForURL(/\/diagnostic/, { timeout: 15000 });
  });

  test('wizard does not reappear once onboarding is complete', async ({ page }) => {
    // After the 56-01 prod migration every existing user (incl. the standard
    // tester) starts with onboardingCompletedAt == null and sees the wizard
    // once. So: log in, complete the wizard if it appears, then verify a
    // second navigation to a (main) route does NOT bounce back to /welcome.
    await login(page, TESTER_EMAIL, TESTER_PASSWORD);
    await page.waitForURL(/\/(welcome|dashboard|learn|diagnostic)/, {
      timeout: 15000,
    });

    if (page.url().includes('/welcome')) {
      await completeWizard(page);
      await page.getByRole('button', { name: /Перейти в обучение/i }).click();
      await page.waitForURL(/\/learn/, { timeout: 15000 });
    }

    // Now onboarded — a fresh visit must stay on the (main) route.
    await page.goto('/learn');
    await expect(page).not.toHaveURL(/\/welcome/);
    await page.goto('/dashboard');
    await expect(page).not.toHaveURL(/\/welcome/);
  });
});
