/**
 * Locale-aware formatting for money, numbers, dates and percentages.
 *
 * Bangladesh default: `৳` with lakh/crore grouping (৳1,25,000) for English and
 * Bangla digits for Bangla. No floating point artifacts ever reach the UI.
 */
import { toMajor, type Money } from './money';

export type Language = 'en' | 'bn';

export interface CurrencySpec {
  code: string;
  symbol: string;
  /** locale used for digit grouping */
  enLocale: string;
  bnLocale: string;
}

export const CURRENCIES: Record<string, CurrencySpec> = {
  BDT: { code: 'BDT', symbol: '৳', enLocale: 'en-IN', bnLocale: 'bn-BD' },
  USD: { code: 'USD', symbol: '$', enLocale: 'en-US', bnLocale: 'bn-BD' },
  EUR: { code: 'EUR', symbol: '€', enLocale: 'de-DE', bnLocale: 'bn-BD' },
  GBP: { code: 'GBP', symbol: '£', enLocale: 'en-GB', bnLocale: 'bn-BD' },
  INR: { code: 'INR', symbol: '₹', enLocale: 'en-IN', bnLocale: 'bn-BD' },
  PKR: { code: 'PKR', symbol: '₨', enLocale: 'en-IN', bnLocale: 'bn-BD' },
  AED: { code: 'AED', symbol: 'د.إ', enLocale: 'en-AE', bnLocale: 'bn-BD' },
  SAR: { code: 'SAR', symbol: '﷼', enLocale: 'en-SA', bnLocale: 'bn-BD' },
  MYR: { code: 'MYR', symbol: 'RM', enLocale: 'en-MY', bnLocale: 'bn-BD' },
};

export function currencySpec(code: string): CurrencySpec {
  return CURRENCIES[code] ?? CURRENCIES.BDT;
}

const numberFmtCache = new Map<string, Intl.NumberFormat>();
function nf(locale: string, opts: Intl.NumberFormatOptions): Intl.NumberFormat {
  const key = `${locale}|${JSON.stringify(opts)}`;
  let cached = numberFmtCache.get(key);
  if (!cached) {
    cached = new Intl.NumberFormat(locale, opts);
    numberFmtCache.set(key, cached);
  }
  return cached;
}

export interface FormatOptions {
  currency?: string;
  lang?: Language;
  /** show ৳ / $ symbol (default true) */
  symbol?: boolean;
  /** decimal places for major units (default: 0 when whole, 2 otherwise) */
  decimals?: number;
  /** compact notation e.g. 1.2L / 3.4Cr for dense dashboards */
  compact?: boolean;
}

/** Format a Money (minor units) as a currency string. */
export function formatMoney(amount: Money | null | undefined, opts: FormatOptions = {}): string {
  const spec = currencySpec(opts.currency ?? 'BDT');
  const lang = opts.lang ?? 'en';
  const locale = lang === 'bn' ? spec.bnLocale : spec.enLocale;
  const value = toMajor(amount ?? 0);
  const showSymbol = opts.symbol ?? true;

  if (opts.compact) {
    const text = nf(locale, {
      notation: 'compact',
      maximumFractionDigits: 1,
      minimumFractionDigits: 0,
    }).format(value);
    return showSymbol ? `${spec.symbol}${value < 0 ? '−' : ''}${text.replace('-', '')}` : text;
  }

  const whole = Number.isInteger(value);
  const decimals = opts.decimals ?? (whole ? 0 : 2);
  const text = nf(locale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
  const negative = text.startsWith('-');
  const body = negative ? text.slice(1) : text;
  const sign = negative ? '−' : '';
  return `${sign}${showSymbol ? spec.symbol : ''}${body}`;
}

/** Major-unit number (ratios, counts) formatting. */
export function formatNumber(value: number | null | undefined, lang: Language = 'en', decimals = 0): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  const locale = lang === 'bn' ? 'bn-BD' : 'en-US';
  return nf(locale, { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(value);
}

/** Percentage with a sign, or "—" when undefined (never NaN / Infinity). */
export function formatPercent(value: number | null | undefined, lang: Language = 'en', decimals = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  const locale = lang === 'bn' ? 'bn-BD' : 'en-US';
  return `${nf(locale, { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(value)}%`;
}

/** Signed percentage for delta chips. */
export function formatDelta(value: number | null | undefined, lang: Language = 'en', decimals = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  const sign = value > 0 ? '+' : value < 0 ? '−' : '';
  return `${sign}${formatPercent(Math.abs(value), lang, decimals)}`;
}

/** Multiplier, e.g. "3.2×" — used for ROAS and break-even ROAS. */
export function formatMultiple(value: number | null | undefined, lang: Language = 'en', decimals = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return `${formatNumber(value, lang, decimals)}×`;
}

export function formatCount(value: number | null | undefined, lang: Language = 'en'): string {
  return formatNumber(value ?? 0, lang, 0);
}

/** Long date, e.g. 14 Sep 2026 / ১৪ সেপ্টেম্বর ২০২৬ */
export function formatDate(iso: string | null | undefined, lang: Language = 'en'): string {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  const date = new Date(Date.UTC(y, m - 1, d, 12));
  try {
    return new Intl.DateTimeFormat(lang === 'bn' ? 'bn-BD' : 'en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(date);
  } catch {
    return iso;
  }
}

/** Short date, e.g. 14 Sep */
export function formatShortDate(iso: string | null | undefined, lang: Language = 'en'): string {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  const date = new Date(Date.UTC(y, m - 1, d, 12));
  try {
    return new Intl.DateTimeFormat(lang === 'bn' ? 'bn-BD' : 'en-GB', {
      day: 'numeric',
      month: 'short',
      timeZone: 'UTC',
    }).format(date);
  } catch {
    return iso;
  }
}

/** Month label, e.g. Sep 2026 */
export function formatMonth(monthKey: string, lang: Language = 'en'): string {
  const [y, m] = monthKey.split('-').map(Number);
  if (!y || !m) return monthKey;
  const date = new Date(Date.UTC(y, m - 1, 1, 12));
  try {
    return new Intl.DateTimeFormat(lang === 'bn' ? 'bn-BD' : 'en-GB', {
      month: 'short',
      year: '2-digit',
      timeZone: 'UTC',
    }).format(date);
  } catch {
    return monthKey;
  }
}

/** Relative day distance in business language. */
export function formatRelativeDays(days: number | null | undefined, lang: Language = 'en'): string {
  if (days === null || days === undefined || !Number.isFinite(days)) return '—';
  const n = Math.round(Math.abs(days));
  if (lang === 'bn') {
    if (n === 0) return 'আজ';
    if (n === 1) return days < 0 ? 'আগামীকাল' : 'গতকাল';
    return `${nf('bn-BD', {}).format(n)} দিন`;
  }
  if (n === 0) return 'Today';
  if (n === 1) return days < 0 ? 'Tomorrow' : 'Yesterday';
  return `${n} days`;
}

/** Truncate for table cells with an ellipsis. */
export function truncate(value: string, max = 40): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}
