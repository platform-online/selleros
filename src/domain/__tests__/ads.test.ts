import { describe, expect, it } from 'vitest';
import {
  breakEvenRoas,
  adMetrics,
  adDecision,
  aggregateAdRows,
  adFunnel,
  biggestFunnelLeak,
  groupAds,
  smartPlusCombinations,
} from '../ads';
import { money } from '../../lib/money';
import type { AdRow } from '../types';

const GUARDS = {
  minPurchases: 20,
  minDays: 7,
  targetRoas: 2,
  minContributionMarginPct: 10,
  maxCac: 0,
  maxReturnRatePct: 15,
  observationWindowDays: 7,
  maxBudgetStepPct: 20,
};

const row = (over: Partial<AdRow> = {}): AdRow => ({
  id: Math.random().toString(36).slice(2),
  date: '2026-09-01',
  platform: 'meta',
  account: '',
  campaign: 'Camp A',
  campaignType: '',
  campaignId: '',
  adset: '',
  ad: '',
  creative: '',
  creativeType: '',
  text: '',
  enhancement: '',
  placement: '',
  network: '',
  productId: null,
  sku: '',
  spend: money('100'),
  impressions: 1000,
  reach: 900,
  clicks: 50,
  linkClicks: 40,
  destinationClicks: 35,
  landingViews: 30,
  addToCart: 10,
  initiateCheckout: 5,
  purchases: 5,
  conversions: 5,
  conversionValue: money('300'),
  revenue: money('300'),
  videoViews: 0,
  videoWatched25: 0,
  videoWatched50: 0,
  videoWatched75: 0,
  videoWatched100: 0,
  createdAt: new Date().toISOString(),
  ...over,
});

describe('break-even ROAS', () => {
  it('is 1 / contribution margin, null when margin <= 0', () => {
    expect(breakEvenRoas(50)).toBeCloseTo(2);
    expect(breakEvenRoas(25)).toBeCloseTo(4);
    expect(breakEvenRoas(0)).toBeNull();
    expect(breakEvenRoas(-10)).toBeNull();
    expect(breakEvenRoas(null)).toBeNull();
  });
});

describe('ad metrics', () => {
  it('computes roas, ctr, cac from aggregates', () => {
    const totals = aggregateAdRows([row()]);
    const m = adMetrics(totals, { days: 7 });
    expect(m.roas).toBeCloseTo(3); // 300 / 100
    expect(m.ctrPct).toBeCloseTo(5); // 50/1000
    expect(m.cac).toBeCloseTo(20); // 100 / 5
    expect(m.samplePurchases).toBe(5);
  });
});

describe('decision engine guardrails', () => {
  const profitable = {
    revenue: money('300'),
    adSpend: money('100'),
    cogs: money('120'),
    courier: 0,
    packaging: 0,
    paymentFees: 0,
    returnCost: 0,
    damage: 0,
    otherVariable: 0,
    contributionProfit: money('80'),
    operatingAllocation: 0,
    netProfit: money('80'),
    roas: 3,
    contributionMarginPct: 26.67,
    netMarginPct: 26.67,
    breakEvenRoas: 2,
    profitPerSpend: 0.8,
  };

  it('insufficient sample => OBSERVE, never SCALE', () => {
    const totals = aggregateAdRows([row({ purchases: 5 })]); // < 20
    const m = adMetrics(totals, { days: 7 });
    const decision = adDecision({ metrics: m, profit: profitable, returnRatePct: 0, guardrails: GUARDS });
    expect(decision.decision).toBe('OBSERVE');
  });

  it('strong metrics with a sufficient sample => SCALE capped at the guardrail', () => {
    const rows = Array.from({ length: 10 }, () => row({ purchases: 5, spend: money('100'), revenue: money('300') }));
    const totals = aggregateAdRows(rows); // 50 purchases
    const m = adMetrics(totals, { days: 10 });
    const decision = adDecision({ metrics: m, profit: profitable, returnRatePct: 0, guardrails: GUARDS });
    expect(decision.decision).toBe('SCALE');
    expect(decision.suggestedBudgetChangePct).toBeLessThanOrEqual(GUARDS.maxBudgetStepPct);
  });

  it('negative contribution => PAUSE', () => {
    const losing = { ...profitable, contributionProfit: money('-50'), netProfit: money('-50'), contributionMarginPct: -15, netMarginPct: -15 };
    const rows = Array.from({ length: 10 }, () => row({ purchases: 5, revenue: money('150'), spend: money('100') }));
    const totals = aggregateAdRows(rows);
    const m = adMetrics(totals, { days: 10 });
    const decision = adDecision({ metrics: m, profit: losing, returnRatePct: 0, guardrails: GUARDS });
    expect(['PAUSE', 'REDUCE']).toContain(decision.decision);
  });
});

describe('funnel', () => {
  it('excludes empty steps and only reports a leak when reliable', () => {
    const totals = aggregateAdRows([row()]);
    const funnel = adFunnel(totals, { minPurchases: 20 });
    expect(funnel.steps.length).toBeGreaterThan(1);
    expect(funnel.reliable).toBe(false); // 5 purchases < 20
    expect(biggestFunnelLeak(funnel)).toBeNull();
  });
});

describe('grouping', () => {
  it('groups by platform and drops empty dimensions', () => {
    const rows = [row(), row({ platform: 'google' }), row({ platform: 'meta' })];
    const groups = groupAds(rows, 'platform', 7);
    expect(groups.map((g) => g.key).sort()).toEqual(['google', 'meta']);
  });

  it('smart+ combines creative × text × enhancement', () => {
    const rows = [
      row({ creative: 'C1', text: 'T1', enhancement: 'On' }),
      row({ creative: 'C1', text: 'T1', enhancement: 'On' }),
      row({ creative: 'C2', text: 'T2' }),
    ];
    const combos = smartPlusCombinations(rows, ['creative', 'text', 'enhancement'], 7);
    expect(combos).toHaveLength(2);
  });
});
