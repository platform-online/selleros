/**
 * Money — decimal-safe arithmetic.
 *
 * Every monetary amount in SellerOS is stored as an INTEGER number of minor
 * units (paisa for BDT, cents for USD, …). Floating point is never used for
 * totals, so sums reconcile exactly and no `0.30000000000000004` artifacts
 * can reach the UI or the ledger.
 *
 * Rules:
 *  - `Money` values are always integers.
 *  - Rounding is explicit (`roundMinor`), half-away-from-zero.
 *  - Splitting an amount across weights uses largest-remainder allocation so
 *    the parts always add back to the whole (critical for cost allocation).
 */

/** Integer minor units. 1 BDT = 100 minor units. */
export type Money = number;

export const MINOR_UNITS_PER_MAJOR = 100;

export const ZERO: Money = 0;

/** Round a possibly fractional minor-unit figure to an integer. */
export function roundMinor(value: number): Money {
  if (!Number.isFinite(value)) return 0;
  return Math.sign(value) * Math.round(Math.abs(value));
}

/** Convert a major-unit number (e.g. 249.99) into minor units (24999). */
export function money(major: number | string | null | undefined): Money {
  if (major === null || major === undefined || major === '') return 0;
  const n = typeof major === 'string' ? Number(String(major).replace(/[^0-9.-]/g, '')) : major;
  if (!Number.isFinite(n)) return 0;
  return roundMinor(n * MINOR_UNITS_PER_MAJOR);
}

/** Convert minor units back to a major-unit number (for display / ratios). */
export function toMajor(minor: Money): number {
  return (minor || 0) / MINOR_UNITS_PER_MAJOR;
}

export const add = (...values: Money[]): Money =>
  values.reduce<Money>((acc, v) => acc + (Number.isFinite(v) ? v : 0), 0);

export const sub = (a: Money, ...rest: Money[]): Money => add(a, ...rest.map((v) => -v));

export const neg = (a: Money): Money => -a;
export const abs = (a: Money): Money => Math.abs(a);

/** Multiply money by a dimensionless factor. */
export function mul(a: Money, factor: number): Money {
  if (!Number.isFinite(factor)) return 0;
  return roundMinor(a * factor);
}

/** Divide money by a dimensionless divisor. */
export function div(a: Money, divisor: number): Money {
  if (!Number.isFinite(divisor) || divisor === 0) return 0;
  return roundMinor(a / divisor);
}

export const sum = (values: readonly Money[]): Money => add(...values);

export function cmp(a: Money, b: Money): number {
  return a === b ? 0 : a < b ? -1 : 1;
}
export const max = (a: Money, b: Money): Money => (a >= b ? a : b);
export const min = (a: Money, b: Money): Money => (a <= b ? a : b);
export const clampNonNegative = (a: Money): Money => (a < 0 ? 0 : a);

/**
 * Safe ratio. Returns `null` when the denominator is zero or missing so the UI
 * can render "—" instead of Infinity or NaN. Never invents a value.
 */
export function ratio(numerator: number, denominator: number): number | null {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator)) return null;
  if (denominator === 0) return null;
  return numerator / denominator;
}

/** Percentage of `whole`, or null when undefined. */
export function percentOf(part: number, whole: number): number | null {
  const r = ratio(part, whole);
  return r === null ? null : r * 100;
}

/**
 * Percentage change from `from` to `to`.
 * Returns null when there is no baseline (avoids divide-by-zero and the
 * misleading "+Infinity%" that dashboards love to show).
 */
export function percentChange(from: number, to: number): number | null {
  if (!Number.isFinite(from) || !Number.isFinite(to)) return null;
  if (from === 0) return null;
  return ((to - from) / Math.abs(from)) * 100;
}

/** Absolute change; always defined for finite numbers. */
export function absoluteChange(from: number, to: number): number {
  if (!Number.isFinite(from) || !Number.isFinite(to)) return 0;
  return to - from;
}

/**
 * Largest-remainder allocation.
 * Splits `amount` across `weights` so that:
 *   - each part is an integer number of minor units
 *   - parts sum EXACTLY to `amount` (no rounding drift, no orphan paisa)
 *   - zero-weight buckets receive zero
 */
export function allocate(amount: Money, weights: readonly number[]): Money[] {
  const total = amount || 0;
  const safe = weights.map((w) => (Number.isFinite(w) && w > 0 ? w : 0));
  const weightSum = safe.reduce((a, b) => a + b, 0);
  if (weightSum <= 0) return safe.map(() => 0);

  const exact = safe.map((w) => (total * w) / weightSum);
  const floors = exact.map((v) => Math.sign(v) * Math.floor(Math.abs(v)));
  let remainder = total - floors.reduce((a, b) => a + b, 0);

  const order = exact
    .map((v, i) => ({ i, frac: Math.abs(v) - Math.floor(Math.abs(v)) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);

  const step = total >= 0 ? 1 : -1;
  for (let k = 0; remainder !== 0 && k < order.length * 4; k++) {
    const idx = order[k % order.length].i;
    if (safe[idx] === 0) continue;
    floors[idx] += step;
    remainder -= step;
  }
  return floors;
}

/** Split an amount evenly into `parts` buckets with exact reconciliation. */
export function splitEvenly(amount: Money, parts: number): Money[] {
  if (!Number.isFinite(parts) || parts <= 0) return [];
  return allocate(amount, new Array(Math.floor(parts)).fill(1));
}

/** `amount` clamped between 0 and `cap`. */
export function clamp(a: Money, low: Money, high: Money): Money {
  return min(max(a, low), high);
}

/** Is this value a meaningful, non-zero amount? */
export const isNonZero = (a: Money): boolean => Math.abs(a || 0) > 0;
