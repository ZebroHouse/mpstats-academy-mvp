import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const SRC_DIR = path.resolve(__dirname, '../../src');
const LOGIN_PAGE = path.join(SRC_DIR, 'app/(auth)/login/page.tsx');
// Phase 65: /register moved out of the centered (auth) group into its own
// full-width split layout at app/register/.
const REGISTER_PAGE = path.join(SRC_DIR, 'app/register/page.tsx');
const REGISTER_FORM = path.join(SRC_DIR, 'app/register/register-form.tsx');
const ACTIONS_FILE = path.join(SRC_DIR, 'lib/auth/actions.ts');
const LANDING_PAGE = path.join(SRC_DIR, 'app/page.tsx');

describe('No Google OAuth references remain', () => {
  it('login/page.tsx does not contain "signInWithGoogle"', () => {
    const content = fs.readFileSync(LOGIN_PAGE, 'utf-8');
    expect(content).not.toContain('signInWithGoogle');
  });

  it('login/page.tsx does not contain "Google"', () => {
    const content = fs.readFileSync(LOGIN_PAGE, 'utf-8');
    expect(content).not.toContain('Google');
  });

  it('register/page.tsx does not contain "signInWithGoogle"', () => {
    const content = fs.readFileSync(REGISTER_PAGE, 'utf-8');
    expect(content).not.toContain('signInWithGoogle');
  });

  it('register/page.tsx does not contain "Google"', () => {
    const content = fs.readFileSync(REGISTER_PAGE, 'utf-8');
    expect(content).not.toContain('Google');
  });

  it('login/page.tsx imports signInWithYandex from actions', () => {
    const content = fs.readFileSync(LOGIN_PAGE, 'utf-8');
    expect(content).toContain('signInWithYandex');
  });

  it('register-form.tsx imports signInWithYandex from actions', () => {
    // After Phase 53A refactor, register/page.tsx became an async wrapper and
    // the form moved to register-form.tsx where the Yandex button lives.
    const content = fs.readFileSync(REGISTER_FORM, 'utf-8');
    expect(content).toContain('signInWithYandex');
  });

  it('actions.ts does not export signInWithGoogle', () => {
    const content = fs.readFileSync(ACTIONS_FILE, 'utf-8');
    expect(content).not.toContain('signInWithGoogle');
  });

  it('landing page does not contain Google OAuth mentions', () => {
    const content = fs.readFileSync(LANDING_PAGE, 'utf-8');
    expect(content).not.toContain('signInWithGoogle');
    expect(content).not.toContain('Google OAuth');
    expect(content).not.toContain('Войти через Google');
  });

  it('no signInWithGoogle in any src/ file', () => {
    const findInDir = (dir: string): string[] => {
      const results: string[] = [];
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory() && entry.name !== 'node_modules') {
          results.push(...findInDir(fullPath));
        } else if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name)) {
          const content = fs.readFileSync(fullPath, 'utf-8');
          if (content.includes('signInWithGoogle')) {
            results.push(fullPath);
          }
        }
      }
      return results;
    };

    const matches = findInDir(SRC_DIR);
    expect(matches).toEqual([]);
  });
});
