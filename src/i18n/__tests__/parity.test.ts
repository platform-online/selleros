import { describe, it, expect, beforeEach } from 'vitest';
import { en, type TranslationKey } from '../en';
import { bn } from '../bn';
import { translate, missingKeys } from '../index';

const enMap = en as Record<string, string>;
const bnMap = bn as Record<string, string>;
const enKeys = Object.keys(enMap).sort();
const bnKeys = Object.keys(bnMap).sort();

/**
 * i18n parity gate (spec §14): every English key must exist in Bangla and vice
 * versa, no value may be empty, and no value may be a copy of its own key —
 * which is exactly how a raw translation key leaks into the UI.
 */
describe('i18n parity', () => {
  beforeEach(() => missingKeys.clear());

  it('has the same number of keys in both languages', () => {
    expect(bnKeys.length).toBe(enKeys.length);
  });

  it('has no missing Bangla keys', () => {
    expect(enKeys.filter((k) => !(k in bnMap))).toEqual([]);
  });

  it('has no extra Bangla keys', () => {
    expect(bnKeys.filter((k) => !(k in enMap))).toEqual([]);
  });

  it('has no empty values in either language', () => {
    const empty = [...enKeys, ...bnKeys].filter((k) => !((enMap[k] ?? bnMap[k]) || '').trim());
    expect(empty).toEqual([]);
  });

  it('has no value that is identical to its own key', () => {
    expect(enKeys.filter((k) => enMap[k] === k)).toEqual([]);
    expect(bnKeys.filter((k) => bnMap[k] === k)).toEqual([]);
  });

  it('resolves every single key in both languages without reporting a miss', () => {
    for (const key of enKeys as TranslationKey[]) {
      const a = translate('en', key);
      const b = translate('bn', key);
      expect(a.length).toBeGreaterThan(0);
      expect(b.length).toBeGreaterThan(0);
    }
    expect([...missingKeys]).toEqual([]);
  });

  it('interpolates parameters', () => {
    expect(translate('en', 'import.errorRow', { row: 12 })).toBe('Row 12');
    expect(translate('en', 'a11y.page', { page: 2, total: 9 })).toBe('Page 2 of 9');
    expect(translate('en', 'data.typeToConfirm', { phrase: 'DELETE' })).toBe('Type DELETE to confirm');
  });

  it('never returns a bare key for an unknown translation', () => {
    const out = translate('en', 'does.not.exist');
    expect(out).not.toBe('does.not.exist');
    expect(missingKeys.has('does.not.exist')).toBe(true);
  });
});
