import { useMemo } from 'react';
import { useWorkspace } from './workspace';
import { useI18n } from '../i18n';
import {
  formatDate,
  formatDelta,
  formatMoney,
  formatMonth,
  formatMultiple,
  formatNumber,
  formatPercent,
  formatRelativeDays,
  formatShortDate,
} from '../lib/format';
import type { Money } from '../lib/money';

/** One formatting API for the whole app — never format inside a component. */
export function useFmt() {
  const { currency, lang } = useWorkspace();
  const { lang: uiLang } = useI18n();
  const language = uiLang ?? lang;

  return useMemo(
    () => ({
      lang: language,
      currency,
      money: (value: Money | null | undefined, compact = false) =>
        value === null || value === undefined ? '—' : formatMoney(value, { currency, lang: language, compact }),
      moneyPlain: (value: Money | null | undefined) =>
        value === null || value === undefined ? '—' : formatMoney(value, { currency, lang: language, symbol: false }),
      num: (value: number | null | undefined, decimals = 0) => formatNumber(value, language, decimals),
      pct: (value: number | null | undefined, decimals = 1) => formatPercent(value, language, decimals),
      delta: (value: number | null | undefined) => formatDelta(value, language, 1),
      multiple: (value: number | null | undefined) => formatMultiple(value, language, 2),
      date: (iso: string | null | undefined) => formatDate(iso, language),
      shortDate: (iso: string | null | undefined) => formatShortDate(iso, language),
      month: (key: string) => formatMonth(key, language),
      relDays: (days: number | null | undefined) => formatRelativeDays(days, language),
    }),
    [currency, language],
  );
}

export type Fmt = ReturnType<typeof useFmt>;
