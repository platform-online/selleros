/**
 * Business dates & periods.
 *
 * All transactional records in SellerOS are keyed by a *business date* string
 * `YYYY-MM-DD` in the business timezone (default Asia/Dhaka). Aggregations are
 * performed on those calendar keys, so month boundaries, year boundaries, leap
 * years and timezone offsets cannot silently move a record between periods.
 */

export type PeriodKey =
  | 'today'
  | 'yesterday'
  | 'last7'
  | 'last30'
  | 'thisMonth'
  | 'lastMonth'
  | 'quarter'
  | 'year'
  | 'custom';

export interface DateRange {
  /** inclusive, YYYY-MM-DD */
  start: string;
  /** inclusive, YYYY-MM-DD */
  end: string;
  /** previous period of identical length, for comparison */
  prev: { start: string; end: string };
  days: number;
}

export const MS_PER_DAY = 86_400_000;

/** Today's business date in the given IANA timezone. */
export function todayISO(timezone = 'Asia/Dhaka'): string {
  try {
    const fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    return fmt.format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

/** Parse `YYYY-MM-DD` as a UTC midnight date (calendar-safe arithmetic). */
export function parseISO(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, (m || 1) - 1, d || 1));
}

export function toISO(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number): string {
  const d = parseISO(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return toISO(d);
}

export function addMonths(iso: string, months: number): string {
  const d = parseISO(iso);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const lastDay = daysInMonth(d.getUTCFullYear(), d.getUTCMonth() + 1);
  d.setUTCDate(Math.min(day, lastDay));
  return toISO(d);
}

export function daysInMonth(year: number, month1: number): number {
  return new Date(Date.UTC(year, month1, 0)).getUTCDate();
}

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/** Number of calendar days in an inclusive range. */
export function daysBetween(startISO: string, endISO: string): number {
  return Math.round((parseISO(endISO).getTime() - parseISO(startISO).getTime()) / MS_PER_DAY) + 1;
}

export function startOfMonth(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}
export function endOfMonth(iso: string): string {
  const [y, m] = iso.split('-').map(Number);
  return `${iso.slice(0, 7)}-${String(daysInMonth(y, m)).padStart(2, '0')}`;
}

export function monthKey(iso: string): string {
  return iso.slice(0, 7);
}

export function diffInDays(fromISO: string, toISO: string): number {
  return Math.round((parseISO(toISO).getTime() - parseISO(fromISO).getTime()) / MS_PER_DAY);
}

export function isWithin(iso: string, range: Pick<DateRange, 'start' | 'end'>): boolean {
  return iso >= range.start && iso <= range.end;
}

function makeRange(start: string, end: string): DateRange {
  const days = daysBetween(start, end);
  return {
    start,
    end,
    days,
    prev: { start: addDays(start, -days), end: addDays(start, -1) },
  };
}

/**
 * Resolve a period key into an inclusive date range plus its comparison
 * period. Handles month/year boundaries and leap years correctly because all
 * arithmetic happens on calendar dates.
 */
export function resolvePeriod(period: PeriodKey, anchorISO: string, custom?: { start: string; end: string }): DateRange {
  const anchor = anchorISO || todayISO();
  switch (period) {
    case 'today':
      return makeRange(anchor, anchor);
    case 'yesterday': {
      const y = addDays(anchor, -1);
      return makeRange(y, y);
    }
    case 'last7':
      return makeRange(addDays(anchor, -6), anchor);
    case 'last30':
      return makeRange(addDays(anchor, -29), anchor);
    case 'thisMonth':
      return makeRange(startOfMonth(anchor), anchor);
    case 'lastMonth': {
      const first = addMonths(startOfMonth(anchor), -1);
      const last = addDays(startOfMonth(anchor), -1);
      return makeRange(first, last);
    }
    case 'quarter': {
      const [y, m] = anchor.split('-').map(Number);
      const qStartMonth = Math.floor((m - 1) / 3) * 3 + 1;
      return makeRange(`${y}-${String(qStartMonth).padStart(2, '0')}-01`, anchor);
    }
    case 'year':
      return makeRange(`${anchor.slice(0, 4)}-01-01`, anchor);
    case 'custom': {
      const start = custom?.start && custom?.start <= (custom?.end ?? anchor) ? custom.start : anchor;
      const end = custom?.end && custom.end >= start ? custom.end : anchor;
      return makeRange(start, end);
    }
    default:
      return makeRange(anchor, anchor);
  }
}

/** Every calendar day in a range (inclusive). Capped for safety. */
export function eachDay(startISO: string, endISO: string, cap = 730): string[] {
  const out: string[] = [];
  let cursor = startISO;
  let guard = 0;
  while (cursor <= endISO && guard < cap) {
    out.push(cursor);
    cursor = addDays(cursor, 1);
    guard++;
  }
  return out;
}

/** Bucket days into months for trend charts. */
export function eachMonth(startISO: string, endISO: string, cap = 60): string[] {
  const out: string[] = [];
  let cursor = startOfMonth(startISO);
  const last = startOfMonth(endISO);
  let guard = 0;
  while (cursor <= last && guard < cap) {
    out.push(cursor);
    cursor = addMonths(cursor, 1);
    guard++;
  }
  return out;
}

/** Human-friendly period label key used by i18n. */
export const PERIOD_KEYS: PeriodKey[] = [
  'today',
  'yesterday',
  'last7',
  'last30',
  'thisMonth',
  'lastMonth',
  'quarter',
  'year',
  'custom',
];
