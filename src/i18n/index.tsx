/**
 * Localization runtime.
 *
 * - `translate()` is the single string lookup. Unknown keys are reported
 *   (dev overlay + test harness) instead of silently rendering a raw key.
 * - `{placeholder}` interpolation is supported.
 * - Language state lives in the workspace settings, so it survives a reload
 *   and is part of every backup.
 */
import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react';
import { createElement } from 'react';
import { en, type TranslationKey } from './en';
import { bn } from './bn';
import type { Language } from '../lib/format';

export const DICTIONARIES: Record<Language, Record<string, string>> = { en, bn };

/** Populated at runtime so tests and the dev overlay can prove parity. */
export const missingKeys = new Set<string>();

export function translate(
  lang: Language,
  key: TranslationKey | string,
  params?: Record<string, string | number>,
): string {
  const dict = DICTIONARIES[lang] ?? en;
  let value = dict[key as string];
  if (value === undefined) {
    missingKeys.add(String(key));
    if (import.meta.env?.DEV) {
      console.warn(`[i18n] missing translation for "${key}" (${lang})`);
    }
    // Fall back to English, then to a humanised key — never a bare key.
    value = (en as Record<string, string>)[key as string] ?? humanise(key);
  }
  if (!params) return value;
  return value.replace(/\{(\w+)\}/g, (_m, name: string) =>
    params[name] === undefined ? `{${name}}` : String(params[name]),
  );
}

function humanise(key: string): string {
  const last = key.split('.').pop() ?? key;
  return last.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase());
}

export type TFunction = (key: TranslationKey | string, params?: Record<string, string | number>) => string;

export interface I18nValue {
  lang: Language;
  t: TFunction;
  /** true when a key was requested but not found in either dictionary */
  hasMissingKeys: () => boolean;
}

const I18nContext = createContext<I18nValue>({
  lang: 'en',
  t: (key, params) => translate('en', key, params),
  hasMissingKeys: () => missingKeys.size > 0,
});

export function I18nProvider(props: { lang: Language; children: ReactNode }) {
  const { lang, children } = props;
  const t = useCallback<TFunction>((key, params) => translate(lang, key, params), [lang]);
  const value = useMemo<I18nValue>(
    () => ({ lang, t, hasMissingKeys: () => missingKeys.size > 0 }),
    [lang, t],
  );
  return createElement(I18nContext.Provider, { value }, children);
}

export function useI18n(): I18nValue {
  return useContext(I18nContext);
}

/** Convenience hook returning just `t`. */
export function useT(): TFunction {
  return useI18n().t;
}

export type { TranslationKey, Language };
export { en, bn };
