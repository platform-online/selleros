/**
 * Route-boot QA: every public screen must mount inside the live app tree
 * (real providers, real router, real demo data) without crashing.
 *
 * For each of the 16 routes we assert:
 *  - exactly one <h1> is rendered (PageHeader contract — every screen owns
 *    its title, and the ErrorBoundary fallback h1 must never appear);
 *  - no console error/warning matches a crash pattern (boundary log,
 *    missing translations, re-render loops, type errors, key warnings);
 *  - the i18n runtime never had to fall back for a requested key.
 *
 * The Bangla pass re-boots the whole app with language='bn' and sweeps all
 * routes again, proving the shell, every page title, and every dynamic label
 * resolve without a single missing translation.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import App from '../App';
import { db, ensureWorkspace } from '../db';
import { seedDemoData } from '../db/demo';
import { missingKeys } from '../i18n';
import type { Language } from '../lib/format';

const ROUTES = [
  '/',
  '/dashboard',
  '/sales',
  '/orders',
  '/products',
  '/inventory',
  '/customers',
  '/suppliers',
  '/couriers',
  '/ads',
  '/finance',
  '/insights',
  '/reports',
  '/documents',
  '/settings',
  '/no-such-page',
];

/** Anything matching these during a boot is treated as an application crash. */
const CRASH_PATTERNS: RegExp[] = [
  /screen crashed/i,
  /Cannot read propert(?:y|ies)/i,
  /is not a function/i,
  /is not defined/i,
  /Too many re-renders/i,
  /Maximum update depth/i,
  /missing translation/i,
  /unique.+"key"/i,
  /Uncaught/i,
  /invariant failed/i,
  /rendered fewer/i,
];

function goTo(path: string) {
  act(() => {
    window.history.pushState({}, '', `#${path}`);
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
}

async function setWorkspace(lang: Language) {
  const s = await db.settings.get('current');
  if (!s) throw new Error('workspace bootstrap did not create settings');
  await db.settings.put({ ...s, onboardingComplete: true, language: lang });
}

/** Mount the whole App, walk every route, and collect per-route failures. */
async function bootAndCheckRoute(lang: Language, path: string) {
  await setWorkspace(lang);
  missingKeys.clear();
  window.history.pushState({}, '', '#/');
  render(<App />);
  await waitFor(() => expect(document.querySelector('.app-shell')).toBeTruthy(), { timeout: 20_000 });
  if (path !== '/') goTo(path);

  const noise: string[] = [];
  const capture = (m: unknown) => noise.push(String(m));
  const errSpy = vi.spyOn(console, 'error').mockImplementation((...a) => a.forEach(capture));
  const warnSpy = vi.spyOn(console, 'warn').mockImplementation((...a) => a.forEach(capture));
  try {
    await waitFor(() => expect(document.querySelectorAll('h1').length).toBeGreaterThanOrEqual(1), {
      timeout: 20_000,
    });
    // let one-shot effects (chart sizing, focus) settle before asserting
    await new Promise((r) => setTimeout(r, 50));

    const h1s = [...document.querySelectorAll('h1')].map((n) => n.textContent?.trim());
    expect(h1s.length, `${lang} ${path}: expected exactly one h1, got ${h1s.length}: ${h1s.join(' | ')}`).toBe(1);
    expect(document.querySelector('.error-state'), `${lang} ${path}: ErrorBoundary fallback`).toBeNull();
    const crashes = noise.filter((m) => CRASH_PATTERNS.some((p) => p.test(m)));
    expect(crashes, `${lang} ${path}: crash-pattern console output`).toEqual([]);
    expect([...missingKeys], `${lang} ${path}: untranslated keys`).toEqual([]);
  } finally {
    errSpy.mockRestore();
    warnSpy.mockRestore();
    cleanup();
  }
}

async function sweep(lang: Language) {
  await setWorkspace(lang);
  missingKeys.clear();
  window.history.pushState({}, '', '#/');
  render(<App />);
  await waitFor(() => expect(document.querySelector('.app-shell')).toBeTruthy(), { timeout: 20_000 });

  const problems: string[] = [];
  for (const path of ROUTES) {
    goTo(path);
    try {
      await waitFor(() => expect(document.querySelectorAll('h1').length).toBeGreaterThanOrEqual(1), {
        timeout: 20_000,
      });
      await new Promise((r) => setTimeout(r, 25));
      if (document.querySelectorAll('h1').length !== 1) problems.push(`${lang} ${path}: h1 count`);
      if (document.querySelector('.error-state')) problems.push(`${lang} ${path}: ErrorBoundary fallback`);
      if (missingKeys.size) problems.push(`${lang} ${path}: untranslated ${[...missingKeys].join(', ')}`);
      missingKeys.clear();
    } catch {
      problems.push(`${lang} ${path}: never rendered an h1`);
    }
  }
  cleanup();
  expect(problems, problems.join('\n')).toEqual([]);
}

describe('route boot (16 routes)', () => {
  beforeAll(async () => {
    await ensureWorkspace();
    await seedDemoData(60);
  }, 60_000);

  afterAll(() => cleanup());

  it.each(ROUTES)(
    'boots %s in English with exactly one h1 and no crash output',
    async (path) => {
      await bootAndCheckRoute('en', path);
    },
    60_000,
  );

  it('sweeps all 16 routes in Bangla without a single missing translation', () => sweep('bn'), 120_000);

  it('the onboarding entry point also boots inside the shell with one h1', async () => {
    await bootAndCheckRoute('en', '/onboarding');
  }, 60_000);

  it('unknown routes land on the NotFound screen with quick links', async () => {
    await setWorkspace('en');
    window.history.pushState({}, '', '#/definitely-not-a-route');
    render(<App />);
    await waitFor(() => expect(document.querySelector('.page-header h1')?.textContent).toBe('Page not found'), {
      timeout: 20_000,
    });
    expect(document.querySelectorAll('h1').length).toBe(1);
    const main = document.querySelector('.app-content');
    for (const link of ['Orders', 'Finance', 'Settings']) {
      expect(main?.textContent).toContain(link);
    }
  }, 60_000);
});
