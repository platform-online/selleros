/**
 * ADVERTISING ENGINE
 * ==================
 * All ad metrics are computed here — never inside a component. Every ratio is
 * guarded against divide-by-zero and returns `null` (rendered as "—") instead
 * of Infinity. Estimates are labelled as estimates at the call site.
 */
import { add, ratio, roundMinor, sub, sum, type Money } from '../lib/money';
import type { AdPlatform, AdRow } from './types';

/* ------------------------------------------------------------------ *
 * Metrics
 * ------------------------------------------------------------------ */

export interface AdTotals {
  spend: Money;
  impressions: number;
  reach: number;
  clicks: number;
  linkClicks: number;
  destinationClicks: number;
  landingViews: number;
  addToCart: number;
  initiateCheckout: number;
  purchases: number;
  conversions: number;
  revenue: Money;
  videoViews: number;
}

export interface AdMetrics extends AdTotals {
  ctrPct: number | null;
  cpc: number | null;
  cpm: number | null;
  cvrPct: number | null;
  cpa: number | null;
  cac: number | null;
  aov: number | null;
  roas: number | null;
  mer: number | null;
  frequency: number | null;
  costPerLandingView: number | null;
  costPerAtc: number | null;
  /** how many purchases the sample contains — drives confidence */
  samplePurchases: number;
  days: number;
}

export function emptyAdTotals(): AdTotals {
  return {
    spend: 0,
    impressions: 0,
    reach: 0,
    clicks: 0,
    linkClicks: 0,
    destinationClicks: 0,
    landingViews: 0,
    addToCart: 0,
    initiateCheckout: 0,
    purchases: 0,
    conversions: 0,
    revenue: 0,
    videoViews: 0,
  };
}

export function aggregateAdRows(rows: readonly AdRow[]): AdTotals {
  const t = emptyAdTotals();
  for (const r of rows) {
    t.spend = add(t.spend, r.spend ?? 0);
    t.impressions += r.impressions ?? 0;
    t.reach += r.reach ?? 0;
    t.clicks += r.clicks ?? 0;
    t.linkClicks += r.linkClicks ?? 0;
    t.destinationClicks += r.destinationClicks ?? 0;
    t.landingViews += r.landingViews ?? 0;
    t.addToCart += r.addToCart ?? 0;
    t.initiateCheckout += r.initiateCheckout ?? 0;
    t.purchases += r.purchases ?? 0;
    t.conversions += r.conversions ?? 0;
    t.revenue = add(t.revenue, r.revenue ?? 0);
    t.videoViews += r.videoViews ?? 0;
  }
  return t;
}

/**
 * Derive every headline ad metric (spec §52).
 * `mer` requires total business revenue + total marketing spend, which are
 * supplied by the caller because they live outside the ad dataset.
 */
export function adMetrics(
  totals: AdTotals,
  extra: { mer?: number | null; newCustomers?: number; days?: number } = {},
): AdMetrics {
  const spendMajor = totals.spend / 100;
  const revenueMajor = totals.revenue / 100;
  const clicks = totals.linkClicks > 0 ? totals.linkClicks : totals.clicks;
  return {
    ...totals,
    ctrPct: ratio(totals.clicks * 100, totals.impressions),
    cpc: ratio(spendMajor, clicks),
    cpm: ratio(spendMajor * 1000, totals.impressions),
    cvrPct: ratio(totals.purchases * 100, clicks),
    cpa: ratio(spendMajor, totals.purchases),
    cac: ratio(spendMajor, extra.newCustomers ?? totals.purchases),
    aov: ratio(revenueMajor, totals.purchases),
    roas: ratio(revenueMajor, spendMajor),
    mer: extra.mer ?? null,
    frequency: ratio(totals.impressions, totals.reach),
    costPerLandingView: ratio(spendMajor, totals.landingViews),
    costPerAtc: ratio(spendMajor, totals.addToCart),
    samplePurchases: totals.purchases,
    days: extra.days ?? 0,
  };
}

/**
 * Break-even ROAS = 1 / contribution margin before ads (spec §54).
 * 40% margin → 2.5×, 20% → 5×. Returns null when margin ≤ 0 — there is no
 * universal break-even ROAS and we never invent one.
 */
export function breakEvenRoas(contributionMarginBeforeAdsPct: number | null): number | null {
  if (contributionMarginBeforeAdsPct === null || !Number.isFinite(contributionMarginBeforeAdsPct)) return null;
  const cm = contributionMarginBeforeAdsPct / 100;
  if (cm <= 0) return null;
  return 1 / cm;
}

/**
 * Contribution margin before ad spend:
 * (net revenue − COGS − courier − packaging − payment fees − returns − other variable)
 * / net revenue. Ad spend is deliberately excluded.
 */
export function contributionMarginBeforeAds(parts: {
  netRevenue: Money;
  cogs: Money;
  courier: Money;
  packaging: Money;
  paymentFees: Money;
  returnCost: Money;
  otherVariable: Money;
}): number | null {
  if (parts.netRevenue <= 0) return null;
  const beforeAds = sub(
    parts.netRevenue,
    parts.cogs,
    parts.courier,
    parts.packaging,
    parts.paymentFees,
    parts.returnCost,
    parts.otherVariable,
  );
  return ratio(beforeAds * 100, parts.netRevenue);
}

export interface AdProfitability {
  revenue: Money;
  adSpend: Money;
  cogs: Money;
  courier: Money;
  packaging: Money;
  paymentFees: Money;
  returnCost: Money;
  damage: Money;
  otherVariable: Money;
  contributionProfit: Money;
  operatingAllocation: Money;
  netProfit: Money;
  roas: number | null;
  contributionMarginPct: number | null;
  netMarginPct: number | null;
  breakEvenRoas: number | null;
  /** spend above/below the break-even point, in money */
  profitPerSpend: number | null;
}

/**
 * Build ad profitability for ANY subset of ad rows (a campaign, a creative, a
 * platform) using the same allocation rules as the period-wide figure, so a
 * drill-down always reconciles with the headline number.
 *
 * Fulfilment, payment, return and operating costs cannot be attributed to a
 * single campaign by the platforms, so they are allocated by the campaign's
 * share of net revenue and the result is labelled an ESTIMATE by the caller.
 */
export function adProfitabilityForRows(input: {
  rows: readonly AdRow[];
  totals: AdTotals;
  pl: {
    netRevenue: Money;
    variable: { courier: Money; packaging: Money; paymentFees: Money; returns: Money };
    operatingExpenses: Money;
  };
  /** resolves a product id OR a SKU to a true unit cost */
  unitCostOf: (key: string) => Money;
}): AdProfitability {
  const { rows, totals, pl, unitCostOf } = input;
  const revenue = sum(rows.map((r) => r.revenue ?? 0));
  const share = pl.netRevenue > 0 ? Math.min(1, revenue / pl.netRevenue) : 0;

  const cogs = sum(
    rows.map((r) => {
      const key = r.productId || r.sku || '';
      const skuKey = key ? key.toLowerCase() : '';
      const cost = key ? (unitCostOf(key) || unitCostOf(skuKey) || 0) : 0;
      return roundMinor(cost * r.purchases);
    }),
  );

  return adProfitability({
    revenue,
    adSpend: totals.spend,
    cogs,
    courier: roundMinor(pl.variable.courier * share),
    packaging: roundMinor(pl.variable.packaging * share),
    paymentFees: roundMinor(pl.variable.paymentFees * share),
    returnCost: roundMinor(pl.variable.returns * share),
    damage: 0,
    otherVariable: 0,
    operatingAllocation: roundMinor(pl.operatingExpenses * share),
  });
}

/**
 * Ad profitability (spec §53). ROAS alone never decides profit — the full cost
 * stack is deducted before any verdict is drawn.
 */
export function adProfitability(input: {
  revenue: Money;
  adSpend: Money;
  cogs: Money;
  courier: Money;
  packaging: Money;
  paymentFees: Money;
  returnCost: Money;
  damage: Money;
  otherVariable: Money;
  operatingAllocation?: Money;
}): AdProfitability {
  const contributionProfit = sub(
    input.revenue,
    input.cogs,
    input.adSpend,
    input.courier,
    input.packaging,
    input.paymentFees,
    input.returnCost,
    input.damage,
    input.otherVariable,
  );
  const operatingAllocation = input.operatingAllocation ?? 0;
  const netProfit = sub(contributionProfit, operatingAllocation);
  const cmBeforeAds = contributionMarginBeforeAds({
    netRevenue: input.revenue,
    cogs: input.cogs,
    courier: input.courier,
    packaging: input.packaging,
    paymentFees: input.paymentFees,
    returnCost: input.returnCost,
    otherVariable: input.otherVariable,
  });
  return {
    ...input,
    operatingAllocation,
    contributionProfit,
    netProfit,
    roas: ratio(input.revenue / 100, input.adSpend / 100),
    contributionMarginPct: ratio(contributionProfit * 100, input.revenue),
    netMarginPct: ratio(netProfit * 100, input.revenue),
    breakEvenRoas: breakEvenRoas(cmBeforeAds),
    profitPerSpend: ratio(contributionProfit, input.adSpend),
  };
}

/* ------------------------------------------------------------------ *
 * Funnel
 * ------------------------------------------------------------------ */

export interface FunnelStep {
  key: string;
  value: number;
  /** conversion from the previous step, % */
  conversionPct: number | null;
  /** cost per unit at this step (major units) */
  costPerUnit: number | null;
  /** drop-off from the previous step, % */
  dropOffPct: number | null;
}

export const FUNNEL_ORDER = [
  'impressions',
  'clicks',
  'landingViews',
  'addToCart',
  'initiateCheckout',
  'purchases',
] as const;

export type FunnelKey = (typeof FUNNEL_ORDER)[number];

/**
 * Build the funnel (spec §63). Only the steps that actually have data are
 * included, and `reliable` is false when the sample is too small to draw
 * conclusions from.
 */
export function adFunnel(
  totals: AdTotals,
  opts: { minPurchases?: number } = {},
): { steps: FunnelStep[]; reliable: boolean; revenue: Money; profit: Money | null } {
  const minPurchases = opts.minPurchases ?? 20;
  const steps: FunnelStep[] = [];
  let prev: number | null = null;
  const spendMajor = totals.spend / 100;

  for (const key of FUNNEL_ORDER) {
    const value = totals[key];
    if (value <= 0) continue;
    steps.push({
      key,
      value,
      conversionPct: prev === null || prev === 0 ? null : (value / prev) * 100,
      costPerUnit: value > 0 ? ratio(spendMajor, value) : null,
      dropOffPct: prev === null || prev === 0 ? null : ((prev - value) / prev) * 100,
    });
    prev = value;
  }

  return {
    steps,
    reliable: totals.purchases >= minPurchases,
    revenue: totals.revenue,
    profit: null,
  };
}

/** Name the leakiest funnel step, but only when the sample supports it. */
export function biggestFunnelLeak(
  funnel: ReturnType<typeof adFunnel>,
): { step: string; dropOffPct: number } | null {
  if (!funnel.reliable) return null;
  const candidates = funnel.steps
    .slice(1)
    .filter((s) => s.dropOffPct !== null && s.dropOffPct > 0);
  if (candidates.length === 0) return null;
  const worst = candidates.reduce((a, b) => ((b.dropOffPct ?? 0) > (a.dropOffPct ?? 0) ? b : a));
  return { step: worst.key, dropOffPct: worst.dropOffPct ?? 0 };
}

/* ------------------------------------------------------------------ *
 * Health score
 * ------------------------------------------------------------------ */

export interface ScoreFactor {
  key: string;
  /** 0..100 contribution */
  score: number;
  weight: number;
  reason: string;
  direction: 'positive' | 'negative' | 'neutral';
}

export interface HealthScore {
  score: number | null;
  band: 'strong' | 'healthy' | 'watch' | 'weak' | 'unknown';
  factors: ScoreFactor[];
  sampleSufficient: boolean;
}

/**
 * Explainable ad health score (spec §64).
 * Missing data is EXCLUDED from the denominator — never treated as zero.
 */
export function adHealthScore(
  m: AdMetrics,
  ctx: {
    targetRoas: number;
    maxCac: number;
    maxReturnRatePct: number;
    returnRatePct: number | null;
    minPurchases: number;
    benchmarkCtrPct?: number;
  },
): HealthScore {
  const factors: ScoreFactor[] = [];
  const sufficient = m.purchases >= ctx.minPurchases;

  const push = (
    key: string,
    value: number | null,
    weight: number,
    good: number,
    bad: number,
    reason: (v: number) => string,
  ) => {
    if (value === null || !Number.isFinite(value)) return; // exclude, don't zero
    // higher-is-better when good > bad
    const span = Math.abs(good - bad);
    const raw = span === 0 ? 0.5 : (value - bad) / (good - bad);
    const score = Math.max(0, Math.min(1, raw)) * 100;
    factors.push({
      key,
      score,
      weight,
      reason: reason(value),
      direction: score >= 66 ? 'positive' : score <= 33 ? 'negative' : 'neutral',
    });
  };

  push('ctr', m.ctrPct, 1, ctx.benchmarkCtrPct ?? 2, 0.4, (v) => `CTR ${v.toFixed(2)}%`);
  push('cpc', m.cpc, 1, 0.05, 0.6, (v) => `CPC ${v.toFixed(2)}`);
  push('cvr', m.cvrPct, 1.4, 3, 0.3, (v) => `Conversion rate ${v.toFixed(2)}%`);
  push('roas', m.roas, 2, ctx.targetRoas * 1.4, ctx.targetRoas * 0.6, (v) => `ROAS ${v.toFixed(2)}×`);
  push('cpa', m.cpa, 1, ctx.maxCac > 0 ? ctx.maxCac * 0.5 : 3, ctx.maxCac > 0 ? ctx.maxCac * 1.5 : 12, (v) => `CPA ${v.toFixed(2)}`);
  push('cac', m.cac, 0.8, ctx.maxCac > 0 ? ctx.maxCac * 0.6 : 4, ctx.maxCac > 0 ? ctx.maxCac * 1.4 : 15, (v) => `CAC ${v.toFixed(2)}`);
  push(
    'frequency',
    m.frequency,
    0.6,
    1.2,
    4.5,
    (v) => `Frequency ${v.toFixed(2)}`,
  );
  if (ctx.returnRatePct !== null) {
    push(
      'returnRate',
      ctx.returnRatePct,
      0.8,
      2,
      ctx.maxReturnRatePct || 15,
      (v) => `Return rate ${v.toFixed(1)}%`,
    );
  }

  const weightSum = factors.reduce((a, f) => a + f.weight, 0);
  const score = weightSum > 0 ? factors.reduce((a, f) => a + f.score * f.weight, 0) / weightSum : null;

  const band: HealthScore['band'] =
    score === null || !sufficient
      ? 'unknown'
      : score >= 75
        ? 'strong'
        : score >= 55
          ? 'healthy'
          : score >= 40
            ? 'watch'
            : 'weak';

  return { score: score === null ? null : Math.round(score * 10) / 10, band, factors, sampleSufficient: sufficient };
}

/* ------------------------------------------------------------------ *
 * Decision engine
 * ------------------------------------------------------------------ */

export type AdDecision = 'SCALE' | 'MAINTAIN' | 'TEST' | 'REDUCE' | 'PAUSE' | 'OBSERVE';

export interface DecisionResult {
  decision: AdDecision;
  /** headline diagnosis, e.g. "High CPM + low CTR" */
  diagnosis: string | null;
  /** what is likely wrong */
  cause: string | null;
  reasons: string[];
  /** recommended budget change in %, respecting the guardrail */
  suggestedBudgetChangePct: number;
  confidence: 'high' | 'medium' | 'low' | 'insufficient';
  guardrailsFailed: string[];
}

export interface DecisionInput {
  metrics: AdMetrics;
  profit: AdProfitability;
  returnRatePct: number | null;
  guardrails: {
    minPurchases: number;
    minDays: number;
    targetRoas: number;
    minContributionMarginPct: number;
    maxCac: number;
    maxReturnRatePct: number;
    observationWindowDays: number;
    maxBudgetStepPct: number;
  };
  /** CTR trend over the observation window, for fatigue detection */
  ctrTrendPct?: number | null;
}

/**
 * Decision engine (spec §65 / §66).
 * Guardrails are hard requirements: if the sample is too small the answer is
 * OBSERVE, never SCALE. Budget steps are capped at `maxBudgetStepPct` (20%
 * default) so the app never recommends an aggressive jump.
 */
export function adDecision(input: DecisionInput): DecisionResult {
  const { metrics: m, profit, guardrails: g } = input;
  const failed: string[] = [];
  const reasons: string[] = [];

  if (m.purchases < g.minPurchases) failed.push(`minPurchases:${m.purchases}<${g.minPurchases}`);
  if (m.days < g.minDays) failed.push(`minDays:${m.days}<${g.minDays}`);
  if (m.roas !== null && m.roas < g.targetRoas) failed.push(`roas:${m.roas.toFixed(2)}<${g.targetRoas}`);
  if (
    profit.contributionMarginPct !== null &&
    profit.contributionMarginPct < g.minContributionMarginPct
  )
    failed.push(`margin:${profit.contributionMarginPct.toFixed(1)}<${g.minContributionMarginPct}`);
  if (g.maxCac > 0 && m.cac !== null && m.cac > g.maxCac) failed.push(`cac:${m.cac.toFixed(2)}>${g.maxCac}`);
  if (input.returnRatePct !== null && input.returnRatePct > g.maxReturnRatePct)
    failed.push(`returnRate:${input.returnRatePct.toFixed(1)}>${g.maxReturnRatePct}`);

  // --- diagnosis -----------------------------------------------------------
  let diagnosis: string | null = null;
  let cause: string | null = null;
  const ctrLow = m.ctrPct !== null && m.ctrPct < 0.8;
  const cpmHigh = m.cpm !== null && m.cpm > 8;
  const cvrLow = m.cvrPct !== null && m.cvrPct < 0.8;
  const cpcHigh = g.maxCac > 0 && m.cpc !== null && m.cpc > g.maxCac * 0.08;

  if (cpmHigh && ctrLow) {
    diagnosis = 'High CPM + low CTR';
    cause = 'Creative, audience or placement problem';
  } else if (m.ctrPct !== null && m.ctrPct > 1.5 && cvrLow) {
    diagnosis = 'High CTR + low conversion';
    cause = 'Landing page, offer or checkout problem';
  } else if (cpcHigh) {
    diagnosis = 'High CPC';
    cause = 'Traffic efficiency problem';
  } else if (m.roas !== null && m.roas >= g.targetRoas && profit.contributionProfit <= 0) {
    diagnosis = 'Good ROAS, no profit';
    cause = 'Unit economics problem';
  } else if (m.frequency !== null && m.frequency > 3 && (input.ctrTrendPct ?? 0) < -10) {
    diagnosis = 'High frequency, falling CTR';
    cause = 'Creative fatigue';
  } else if (m.roas !== null && m.roas < g.targetRoas && m.ctrPct !== null && m.ctrPct > 1.5) {
    diagnosis = 'Low ROAS with strong CTR';
    cause = 'Monetisation or offer problem';
  } else if (input.returnRatePct !== null && input.returnRatePct > g.maxReturnRatePct) {
    diagnosis = 'High return rate';
    cause = 'Product, offer or fulfilment problem';
  }

  // --- decision ------------------------------------------------------------
  const insufficient = m.purchases < g.minPurchases || m.days < g.minDays;
  let decision: AdDecision;
  let suggested = 0;

  if (insufficient) {
    decision = 'OBSERVE';
    reasons.push('Not enough data for a confident recommendation.');
  } else if (m.roas !== null && m.roas < 0.5 && profit.contributionProfit < 0) {
    decision = 'PAUSE';
    suggested = -100;
    reasons.push('Losing money on every purchase at this ROAS.');
  } else if (failed.length >= 3 || profit.contributionProfit < 0) {
    decision = 'REDUCE';
    suggested = -Math.min(30, g.maxBudgetStepPct * 1.5);
    reasons.push('Costs exceed contribution.');
  } else if (failed.length === 0 && profit.contributionProfit > 0) {
    decision = 'SCALE';
    suggested = g.maxBudgetStepPct; // capped — never an aggressive jump
    reasons.push('Every guardrail passed and contribution profit is positive.');
  } else if (failed.length === 1 && m.roas !== null && m.roas >= g.targetRoas * 0.9) {
    decision = 'TEST';
    suggested = 0;
    reasons.push('One guardrail is marginal — test a new creative or audience.');
  } else {
    decision = 'MAINTAIN';
    suggested = 0;
  }

  const confidence: DecisionResult['confidence'] = insufficient
    ? 'insufficient'
    : m.purchases >= g.minPurchases * 3 && m.days >= g.minDays * 2
      ? 'high'
      : m.purchases >= g.minPurchases
        ? 'medium'
        : 'low';

  if (diagnosis) reasons.unshift(diagnosis);

  return {
    decision,
    diagnosis,
    cause,
    reasons,
    suggestedBudgetChangePct: Math.round(suggested),
    confidence,
    guardrailsFailed: failed,
  };
}

/** Creative-fatigue detection (spec §64 / §113). */
export function creativeFatigue(input: {
  frequency: number | null;
  ctrNowPct: number | null;
  ctrBeforePct: number | null;
  minImpressions: number;
  impressions: number;
}): { fatigued: boolean; reason: string | null } {
  if (input.impressions < input.minImpressions) {
    return { fatigued: false, reason: null };
  }
  if (input.frequency === null || input.ctrNowPct === null || input.ctrBeforePct === null) {
    return { fatigued: false, reason: null };
  }
  const dropPct =
    input.ctrBeforePct > 0 ? ((input.ctrNowPct - input.ctrBeforePct) / input.ctrBeforePct) * 100 : 0;
  if (input.frequency > 3 && dropPct < -15) {
    return {
      fatigued: true,
      reason: `Frequency ${input.frequency.toFixed(1)}× with CTR down ${Math.abs(dropPct).toFixed(0)}%`,
    };
  }
  return { fatigued: false, reason: null };
}

/* ------------------------------------------------------------------ *
 * Grouping
 * ------------------------------------------------------------------ */

export type AdDimension =
  | 'platform'
  | 'campaign'
  | 'adset'
  | 'ad'
  | 'creative'
  | 'text'
  | 'enhancement'
  | 'placement'
  | 'network'
  | 'campaignType'
  | 'product';

export function dimensionKey(row: AdRow, dim: AdDimension): string {
  switch (dim) {
    case 'platform':
      return row.platform;
    case 'campaign':
      return row.campaign;
    case 'adset':
      return row.adset;
    case 'ad':
      return row.ad;
    case 'creative':
      return row.creative;
    case 'text':
      return row.text;
    case 'enhancement':
      return row.enhancement;
    case 'placement':
      return row.placement;
    case 'network':
      return row.network;
    case 'campaignType':
      return row.campaignType;
    case 'product':
      return row.sku || row.productId || '';
    default:
      return '';
  }
}

export interface AdGroup {
  key: string;
  dimension: AdDimension;
  rows: AdRow[];
  totals: AdTotals;
  metrics: AdMetrics;
}

/** Group rows by a dimension, ignoring rows where the dimension is empty. */
export function groupAds(rows: readonly AdRow[], dim: AdDimension, days: number): AdGroup[] {
  const map = new Map<string, AdRow[]>();
  for (const r of rows) {
    const key = dimensionKey(r, dim);
    if (!key) continue;
    const bucket = map.get(key);
    if (bucket) bucket.push(r);
    else map.set(key, [r]);
  }
  return [...map.entries()]
    .map(([key, groupRows]) => {
      const totals = aggregateAdRows(groupRows);
      return { key, dimension: dim, rows: groupRows, totals, metrics: adMetrics(totals, { days }) };
    })
    .sort((a, b) => b.totals.spend - a.totals.spend);
}

/**
 * TikTok Smart+ combination analysis (spec §61): creative × text × enhancement
 * and any subset. Empty dimensions are dropped so combinations stay honest.
 */
export function smartPlusCombinations(
  rows: readonly AdRow[],
  dims: ('creative' | 'text' | 'enhancement')[],
  days: number,
): AdGroup[] {
  const map = new Map<string, AdRow[]>();
  for (const r of rows) {
    const parts = dims.map((d) => r[d]).filter(Boolean);
    if (parts.length === 0) continue;
    const key = parts.join(' × ');
    const bucket = map.get(key);
    if (bucket) bucket.push(r);
    else map.set(key, [r]);
  }
  return [...map.entries()]
    .map(([key, groupRows]) => {
      const totals = aggregateAdRows(groupRows);
      return { key, dimension: 'creative' as AdDimension, rows: groupRows, totals, metrics: adMetrics(totals, { days }) };
    })
    .sort((a, b) => b.totals.spend - a.totals.spend);
}

export const PLATFORMS: AdPlatform[] = ['meta', 'google', 'tiktok', 'other'];

export function platformLabel(p: string): string {
  switch (p) {
    case 'meta':
      return 'Meta';
    case 'google':
      return 'Google';
    case 'tiktok':
      return 'TikTok';
    default:
      return p || 'Other';
  }
}

/* ------------------------------------------------------------------ *
 * Budget simulator (spec §67) — clearly labelled ESTIMATE by the caller
 * ------------------------------------------------------------------ */

export interface BudgetSimulation {
  spend: Money;
  roas: number;
  revenue: Money;
  orders: number;
  cogs: Money;
  fulfillment: Money;
  returnCost: Money;
  contributionProfit: Money;
  netProfit: Money;
  contributionMarginPct: number | null;
  breakEvenRoas: number | null;
  profitable: boolean;
}

export function simulateBudget(input: {
  adSpend: Money;
  expectedRoas: number;
  expectedConversionRatePct: number;
  cpc: number;
  marginPct: number;
  returnRatePct: number;
  courierCostPerOrder: Money;
  paymentFeePct: number;
}): BudgetSimulation {
  const spend = roundMinor(input.adSpend);
  const roas = Number.isFinite(input.expectedRoas) && input.expectedRoas > 0 ? input.expectedRoas : 0;
  const revenue = roundMinor(spend * roas);
  const clicks = input.cpc > 0 ? (spend / 100) / input.cpc : 0;
  const cvr = input.expectedConversionRatePct / 100;
  const orders = Math.round(clicks * cvr);

  const cogs = roundMinor(revenue * (1 - input.marginPct / 100));
  const fulfillment = roundMinor(roundMinor(input.courierCostPerOrder) * orders);
  const paymentFee = roundMinor(revenue * (input.paymentFeePct / 100));
  const returnCost = roundMinor(add(fulfillment, cogs) * (input.returnRatePct / 100));
  const contributionProfit = sub(revenue, cogs, spend, fulfillment, paymentFee, returnCost);
  const cmBeforeAds = input.marginPct - input.paymentFeePct - input.returnRatePct * 0.5;

  return {
    spend,
    roas,
    revenue,
    orders,
    cogs,
    fulfillment: add(fulfillment, paymentFee),
    returnCost,
    contributionProfit,
    netProfit: contributionProfit,
    contributionMarginPct: ratio(contributionProfit * 100, revenue),
    breakEvenRoas: breakEvenRoas(cmBeforeAds),
    profitable: contributionProfit > 0,
  };
}

/* ------------------------------------------------------------------ *
 * Price simulator (spec §68)
 * ------------------------------------------------------------------ */

export interface PriceScenario {
  deltaPct: number;
  price: Money;
  revenuePerUnit: Money;
  trueCost: Money;
  contributionProfit: Money;
  marginPct: number | null;
  breakEvenRoas: number | null;
}

export const PRICE_STEPS = [-10, -5, 0, 5, 10, 15];

export function priceScenarios(input: {
  currentPrice: Money;
  trueUnitCost: Money;
  courierPerOrder: Money;
  packagingPerOrder: Money;
  paymentFeePct: number;
  returnRatePct: number;
}): PriceScenario[] {
  return PRICE_STEPS.map((deltaPct) => {
    const price = roundMinor(input.currentPrice * (1 + deltaPct / 100));
    const paymentFee = roundMinor(price * (input.paymentFeePct / 100));
    const returnCost = roundMinor(add(input.courierPerOrder, price) * (input.returnRatePct / 100));
    const contributionProfit = sub(
      price,
      input.trueUnitCost,
      input.courierPerOrder,
      input.packagingPerOrder,
      paymentFee,
      returnCost,
    );
    const cmBeforeAds = contributionMarginBeforeAds({
      netRevenue: price,
      cogs: input.trueUnitCost,
      courier: input.courierPerOrder,
      packaging: input.packagingPerOrder,
      paymentFees: paymentFee,
      returnCost,
      otherVariable: 0,
    });
    return {
      deltaPct,
      price,
      revenuePerUnit: price,
      trueCost: input.trueUnitCost,
      contributionProfit,
      marginPct: ratio(contributionProfit * 100, price),
      breakEvenRoas: breakEvenRoas(cmBeforeAds),
    };
  });
}

/** Sum spend across rows for a platform filter. */
export function spendByPlatform(rows: readonly AdRow[]): Map<AdPlatform, Money> {
  const out = new Map<AdPlatform, Money>();
  for (const r of rows) out.set(r.platform, add(out.get(r.platform) ?? 0, r.spend ?? 0));
  return out;
}

/** Total ad spend in a row set. */
export const totalSpend = (rows: readonly AdRow[]): Money => sum(rows.map((r) => r.spend ?? 0));
