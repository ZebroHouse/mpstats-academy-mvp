import { test, expect, type Page } from '@playwright/test';

/**
 * Wave 0 RED stub — Phase 61 (Обучение 2.0).
 *
 * The /learn route split (plan / solutions / library / favorites) plus the
 * server-side aliases land in 61-01. Until then these specs are `test.fixme`
 * (collected, reported as expected-to-fail, never executed). 61-01 removes
 * `.fixme` to turn them GREEN.
 *
 * CONTRACT (UI-SPEC § Interaction & State Contracts):
 *   - /learn/track  → SERVER redirect → /learn/plan        (legacy alias)
 *   - /learn        → SERVER redirect → default (/learn/plan or /learn/library)
 *
 * Redirects MUST be server-side (`redirect()` in a Server Component), NEVER a
 * client `router.push` in useEffect — that re-triggers the Next Router Cache
 * loop (incident 2026-05-19, CLAUDE.md gotcha). We therefore assert ONLY the
 * final URL, never the navigation mechanism.
 */

const TESTER_EMAIL = 'tester@mpstats.academy';
const TESTER_PASSWORD = 'TestUser2024';

async function login(page: Page) {
  await page.goto('/login');
  await page.fill('input[type="email"]', TESTER_EMAIL);
  await page.fill('input[type="password"]', TESTER_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(learn|dashboard|diagnostic)/, { timeout: 15000 });
}

test.describe('learn redirects', () => {
  test('/learn/track lands on /learn/plan (server redirect)', async ({ page }) => {
    await login(page);
    await page.goto('/learn/track');
    // Final URL only — server redirect, no router.push.
    await expect(page).toHaveURL(/\/learn\/plan$/);
  });

  test.fixme('/learn lands on a default sub-route (/learn/plan or /learn/library)', async ({ page }) => {
    await login(page);
    await page.goto('/learn');
    // Default-by-plan: a user with a plan → /learn/plan, otherwise /learn/library.
    await expect(page).toHaveURL(/\/learn\/(plan|library)$/);
  });
});
