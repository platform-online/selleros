/**
 * Statistics helpers used by the intelligence layer.
 * Every function is defensive: small samples return `null` / low-confidence
 * signals so the app never states false certainty.
 */

export function mean(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function sum(values: readonly number[]): number {
  return values.reduce((a, b) => a + b, 0);
}

export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function stdev(values: readonly number[]): number | null {
  if (values.length < 2) return null;
  const m = mean(values);
  if (m === null) return null;
  const variance = values.reduce((acc, v) => acc + (v - m) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

/**
 * Linear-regression slope over a series of y values.
 * Returns null when there are fewer than 3 observations (not enough signal).
 */
export function linearSlope(values: readonly number[]): number | null {
  const n = values.length;
  if (n < 3) return null;
  const xs = values.map((_, i) => i);
  const mx = mean(xs)!;
  const my = mean(values)!;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (values[i] - my);
    den += (xs[i] - mx) ** 2;
  }
  if (den === 0) return null;
  return num / den;
}

/**
 * Outlier flags using a robust z-score (median absolute deviation).
 * Returns indexes that deviate more than `threshold` MADs.
 */
export function outlierIndexes(values: readonly number[], threshold = 3.5): number[] {
  const m = median(values);
  if (m === null) return [];
  const deviations = values.map((v) => Math.abs(v - m));
  const mad = median(deviations);
  if (mad === null || mad === 0) return [];
  const out: number[] = [];
  values.forEach((v, i) => {
    const z = (0.6745 * (v - m)) / mad;
    if (Math.abs(z) > threshold) out.push(i);
  });
  return out;
}

/**
 * Exponential smoothing forecast.
 * Returns point estimates for `horizon` steps plus a residual-based band.
 * Requires at least `minPoints` history entries, otherwise returns null so the
 * UI can honestly say "not enough data".
 */
export interface ForecastResult {
  points: number[];
  lower: number[];
  upper: number[];
  method: 'exponential-smoothing' | 'linear-trend';
  historyUsed: number;
  mape: number | null;
}

export function forecast(
  series: readonly number[],
  horizon: number,
  opts: { alpha?: number; minPoints?: number; confidence?: number } = {},
): ForecastResult | null {
  const alpha = opts.alpha ?? 0.35;
  const minPoints = opts.minPoints ?? 6;
  if (series.length < minPoints || horizon <= 0) return null;

  let level = series[0];
  const fitted: number[] = [level];
  for (let i = 1; i < series.length; i++) {
    const prev = level;
    level = alpha * series[i] + (1 - alpha) * prev;
    fitted.push(prev);
  }

  // slope from the smoothed level series keeps the forecast trending
  const slope = linearSlope(series.slice(-Math.min(8, series.length))) ?? 0;
  const damped = slope * 0.6;

  const points: number[] = [];
  for (let h = 1; h <= horizon; h++) {
    points.push(Math.max(0, level + damped * h));
  }

  const residuals = series.map((v, i) => v - fitted[i]).slice(1);
  const sd = stdev(residuals) ?? 0;
  const z = opts.confidence ?? 1.28; // ~80% band
  const lower = points.map((p, i) => Math.max(0, p - z * sd * Math.sqrt(i + 1)));
  const upper = points.map((p, i) => p + z * sd * Math.sqrt(i + 1));

  const actual = series.slice(1);
  const errors = actual.map((v, i) => (v === 0 ? null : Math.abs((v - fitted[i + 1]) / v)));
  const mape = mean(errors.filter((e): e is number => e !== null));

  return {
    points,
    lower,
    upper,
    method: 'exponential-smoothing',
    historyUsed: series.length,
    mape: mape === null ? null : mape * 100,
  };
}

/** HHI (Herfindahl–Hirschman Index) — 0..1 concentration of shares. */
export function hhi(shares: readonly number[]): number {
  const total = sum(shares);
  if (total <= 0) return 0;
  return shares.reduce((acc, s) => acc + (s / total) ** 2, 0);
}

/** Share of the top N items — used for concentration risk. */
export function topShare(values: readonly number[], n: number): number {
  const total = sum(values);
  if (total <= 0) return 0;
  const top = [...values].sort((a, b) => b - a).slice(0, n);
  return sum(top) / total;
}

/**
 * Is a change meaningful? Combines relative and absolute thresholds so tiny
 * movements on small numbers never trigger alerts (spec 71 / 114).
 */
export function isMeaningfulChange(
  from: number,
  to: number,
  opts: { minRelative?: number; minAbsolute?: number } = {},
): boolean {
  const minRelative = opts.minRelative ?? 0.1;
  const minAbsolute = opts.minAbsolute ?? 0;
  const delta = to - from;
  if (Math.abs(delta) < minAbsolute) return false;
  if (from === 0) return Math.abs(delta) >= minAbsolute;
  return Math.abs(delta / Math.abs(from)) >= minRelative;
}

/** 0..100 normalisation with graceful handling of empty ranges. */
export function normalize(value: number, low: number, high: number): number {
  if (!Number.isFinite(value)) return 0;
  if (high <= low) return value >= high ? 1 : 0;
  return Math.min(1, Math.max(0, (value - low) / (high - low)));
}
