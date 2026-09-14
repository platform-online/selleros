/**
 * INTELLIGENCE ENGINE
 * ===================
 * Turns metrics into explainable judgement. Hard rules enforced everywhere:
 *  - missing data is EXCLUDED, never treated as zero
 *  - no recommendation without a sufficient sample
 *  - no invented financial impact
 */
import { add, ratio, roundMinor, sub, sum, type Money } from '../lib/money';
import { addDays, type DateRange } from '../lib/dates';
import { fingerprint } from '../lib/id';
import { forecast, isMeaningfulChange, linearSlope, topShare } from '../lib/stats';
import { breakEvenRoas, type AdMetrics, type AdProfitability } from './ads';
import type { BreakEven, CashFlow, Positions, ProfitAndLoss } from './finance';
import type {
  InventoryAnalytics,
  PeriodMetrics,
  ProductProfitRow,
  CustomerRow,
  CourierRow,
  SupplierRow,
  ExpenseInsight,
  RenewalRow,
  TrendPoint,
} from './context';
import type { Settings, Thresholds } from './types';

/* ------------------------------------------------------------------ *
 * Business health score (spec §21)
 * ------------------------------------------------------------------ */

export type HealthDimension =
  | 'profitability'
  | 'cash'
  | 'growth'
  | 'advertising'
  | 'inventory'
  | 'returns'
  | 'fulfillment'
  | 'receivables'
  | 'expenses'
  | 'customers';

export interface DimensionScore {
  key: HealthDimension;
  /** 0..100, or null when there is not enough data to judge */
  score: number | null;
  weight: number;
  evidence: string;
  reason: string;
  positive: string | null;
  negative: string | null;
  recommendation: string;
  /** metric key the UI can link to */
  metric: string;
}

export interface BusinessHealth {
  score: number | null;
  band: 'excellent' | 'good' | 'fair' | 'poor' | 'unknown';
  dimensions: DimensionScore[];
  includedCount: number;
  excludedCount: number;
}

export interface HealthInput {
  metrics: PeriodMetrics;
  previous: PeriodMetrics | null;
  inventory: InventoryAnalytics;
  customers: CustomerRow[];
  settings: Settings;
}

export function businessHealthScore(input: HealthInput): BusinessHealth {
  const { metrics, previous, inventory, customers, settings } = input;
  const t = settings.thresholds;
  const pl = metrics.pl;
  const dims: DimensionScore[] = [];

  /* ---- Profitability ---- */
  if (pl.netRevenue > 0 && pl.netMarginPct !== null) {
    const margin = pl.netMarginPct;
    const score = clampScore(50 + margin * 2.6, 0, 100);
    dims.push({
      key: 'profitability',
      score,
      weight: 2,
      metric: 'netMarginPct',
      evidence: `${margin.toFixed(1)}% net margin`,
      reason:
        margin >= t.healthyNetMarginPct
          ? 'Net margin is at or above your healthy target.'
          : 'Net margin is below your healthy target.',
      positive: margin >= t.healthyNetMarginPct ? `Net margin ${margin.toFixed(1)}% meets your target` : null,
      negative:
        margin < t.healthyNetMarginPct
          ? `Net margin ${margin.toFixed(1)}% is below the ${t.healthyNetMarginPct}% you set`
          : null,
      recommendation:
        margin < t.healthyNetMarginPct
          ? 'Review the largest cost lines in Profit & Loss and the products with the weakest contribution.'
          : 'Keep the current cost structure; watch margin as volume grows.',
    });
  } else {
    dims.push(excluded('profitability', 'No revenue in this period yet.'));
  }

  /* ---- Cash ---- */
  const runway = metrics.cashRunwayDays;
  if (metrics.cash.closingCash !== 0 || (runway !== null && Number.isFinite(runway))) {
    const days = runway === null ? 365 : Math.min(runway, 365);
    const score = clampScore((days / Math.max(t.cashRunwayDays, 1)) * 100, 0, 100);
    dims.push({
      key: 'cash',
      score,
      weight: 1.8,
      metric: 'cashRunwayDays',
      evidence: runway === null ? 'No recurring cash burn recorded' : `${Math.round(days)} days of runway`,
      reason:
        runway === null
          ? 'No operating outflow recorded, so runway is not meaningful yet.'
          : days >= t.cashRunwayDays
            ? 'Cash covers your operating costs well beyond your safety window.'
            : 'Cash covers less operating time than your safety window.',
      positive: runway !== null && days >= t.cashRunwayDays ? `${Math.round(days)} days of cash on hand` : null,
      negative:
        runway !== null && days < t.cashRunwayDays ? `Only ${Math.round(days)} days of cash at current burn` : null,
      recommendation:
        runway !== null && days < t.cashRunwayDays
          ? 'Collect outstanding receivables and delay non-essential purchases.'
          : 'Maintain the current cash buffer.',
    });
  } else {
    dims.push(excluded('cash', 'No cash movement recorded.'));
  }

  /* ---- Growth ---- */
  if (previous && previous.pl.netRevenue > 0) {
    const change = ((pl.netRevenue - previous.pl.netRevenue) / previous.pl.netRevenue) * 100;
    const score = clampScore(50 + change * 1.6, 0, 100);
    dims.push({
      key: 'growth',
      score,
      weight: 1.4,
      metric: 'revenueGrowthPct',
      evidence: `${change >= 0 ? '+' : ''}${change.toFixed(1)}% revenue vs previous period`,
      reason: change >= 0 ? 'Revenue is growing period over period.' : 'Revenue has fallen period over period.',
      positive: change > 0 ? `Revenue up ${change.toFixed(1)}%` : null,
      negative: change < 0 ? `Revenue down ${Math.abs(change).toFixed(1)}%` : null,
      recommendation:
        change < 0
          ? 'Compare orders, AOV and ad delivery between the two periods to find the driver.'
          : 'Confirm the growth is profitable, not just higher volume.',
    });
  } else {
    dims.push(excluded('growth', 'No previous period to compare against.'));
  }

  /* ---- Advertising ---- */
  if (metrics.ad.spend > 0 && metrics.ad.purchases > 0) {
    const target = settings.guardrails.targetRoas;
    const roas = metrics.ad.roas ?? 0;
    const be = metrics.breakEvenRoasValue;
    const profitable = be === null ? metrics.adProfit.contributionProfit > 0 : roas >= be;
    const score = clampScore(target > 0 ? (roas / target) * 60 : 60, 0, 100);
    dims.push({
      key: 'advertising',
      score,
      weight: 1.4,
      metric: 'roas',
      evidence: `ROAS ${roas.toFixed(2)}× vs target ${target}×`,
      reason: profitable ? 'Advertising is clearing its break-even ROAS.' : 'Advertising is below break-even ROAS.',
      positive: profitable ? `ROAS ${roas.toFixed(2)}× clears break-even` : null,
      negative: !profitable ? `ROAS ${roas.toFixed(2)}× is below break-even ${be?.toFixed(2) ?? '—'}×` : null,
      recommendation: profitable
        ? 'Scale the campaigns that clear break-even with profit, in small steps.'
        : 'Pause or restructure campaigns below break-even before adding budget.',
    });
  } else {
    dims.push(excluded('advertising', 'No ad spend or purchases recorded.'));
  }

  /* ---- Inventory ---- */
  if (inventory.totalUnits > 0 || inventory.rows.length > 0) {
    const atRisk = inventory.stockoutRisk.length;
    const dead = inventory.deadStock.length;
    const total = Math.max(inventory.rows.length, 1);
    const problemShare = (atRisk + dead) / total;
    const score = clampScore(100 - problemShare * 100, 0, 100);
    dims.push({
      key: 'inventory',
      score,
      weight: 1.2,
      metric: 'stockoutRisk',
      evidence: `${atRisk} products at stockout risk, ${dead} dead`,
      reason:
        problemShare < 0.15
          ? 'Stock levels match demand.'
          : 'A significant share of the catalogue is either running out or not selling.',
      positive: atRisk === 0 ? 'No products at stockout risk' : null,
      negative:
        atRisk > 0
          ? `${atRisk} products are at or below reorder level`
          : dead > 0
            ? `${dead} products have not sold in ${t.deadStockDays}+ days`
            : null,
      recommendation:
        atRisk > 0
          ? 'Reorder the highest-selling products that are close to running out.'
          : dead > 0
            ? 'Clear dead stock with a bundle or discount instead of buying more.'
            : 'Keep the current reorder cadence.',
    });
  } else {
    dims.push(excluded('inventory', 'No products in the catalogue.'));
  }

  /* ---- Returns ---- */
  if (metrics.returnRatePct !== null) {
    const rate = metrics.returnRatePct;
    const score = clampScore(100 - (rate / Math.max(t.returnRatePct, 1)) * 50, 0, 100);
    dims.push({
      key: 'returns',
      score,
      weight: 1.1,
      metric: 'returnRatePct',
      evidence: `${rate.toFixed(1)}% return rate`,
      reason: rate <= t.returnRatePct ? 'Returns are within your tolerance.' : 'Returns exceed your tolerance.',
      positive: rate <= t.returnRatePct / 2 ? `Return rate only ${rate.toFixed(1)}%` : null,
      negative: rate > t.returnRatePct ? `Return rate ${rate.toFixed(1)}% exceeds ${t.returnRatePct}%` : null,
      recommendation:
        rate > t.returnRatePct
          ? 'Check the top return reasons and the couriers with the highest return rate.'
          : 'Monitor return reasons for early warning.',
    });
  } else {
    dims.push(excluded('returns', 'No delivered units to measure returns against.'));
  }

  /* ---- Fulfilment ---- */
  if (metrics.deliverySuccessPct !== null) {
    const rate = metrics.deliverySuccessPct;
    const score = clampScore(rate, 0, 100);
    dims.push({
      key: 'fulfillment',
      score,
      weight: 1,
      metric: 'deliverySuccessPct',
      evidence: `${rate.toFixed(1)}% delivery success`,
      reason: rate >= 85 ? 'Most closed orders are delivered.' : 'Too many closed orders fail or are returned.',
      positive: rate >= 90 ? `${rate.toFixed(1)}% of closed orders delivered` : null,
      negative: rate < 85 ? `Only ${rate.toFixed(1)}% of closed orders delivered` : null,
      recommendation:
        rate < 85
          ? 'Compare courier net contribution — a cheaper courier that fails more often costs more.'
          : 'Current fulfilment is healthy.',
    });
  } else {
    dims.push(excluded('fulfillment', 'No closed orders yet.'));
  }

  /* ---- Receivables ---- */
  if (pl.netRevenue > 0) {
    const share = (metrics.positions.receivables / pl.netRevenue) * 100;
    const score = clampScore(100 - share * 1.4, 0, 100);
    dims.push({
      key: 'receivables',
      score,
      weight: 0.9,
      metric: 'receivablesSharePct',
      evidence: `${share.toFixed(1)}% of revenue uncollected`,
      reason: share <= 25 ? 'Most revenue has been collected.' : 'A large share of revenue is still uncollected.',
      positive: share <= 15 ? `Only ${share.toFixed(1)}% of revenue outstanding` : null,
      negative: share > 25 ? `${share.toFixed(1)}% of revenue still uncollected` : null,
      recommendation:
        share > 25 ? 'Follow up on unpaid orders and check courier COD settlement timing.' : 'Collection is on track.',
    });
  } else {
    dims.push(excluded('receivables', 'No revenue to collect.'));
  }

  /* ---- Expenses ---- */
  if (pl.netRevenue > 0 && pl.operatingExpenses > 0) {
    const ratioPct = (pl.operatingExpenses / pl.netRevenue) * 100;
    const score = clampScore(100 - ratioPct * 2.2, 0, 100);
    dims.push({
      key: 'expenses',
      score,
      weight: 0.9,
      metric: 'fixedCostRatioPct',
      evidence: `Operating costs are ${ratioPct.toFixed(1)}% of net revenue`,
      reason: ratioPct <= 20 ? 'Operating cost is contained relative to revenue.' : 'Operating cost is heavy relative to revenue.',
      positive: ratioPct <= 12 ? `Operating cost only ${ratioPct.toFixed(1)}% of revenue` : null,
      negative: ratioPct > 20 ? `Operating cost is ${ratioPct.toFixed(1)}% of revenue` : null,
      recommendation:
        ratioPct > 20 ? 'Review fixed subscriptions and renewals in Expenses.' : 'Operating cost is proportionate.',
    });
  } else {
    dims.push(excluded('expenses', 'No operating expenses recorded.'));
  }

  /* ---- Customers ---- */
  if (customers.length > 0) {
    const repeat = customers.filter((c) => c.orders > 1).length;
    const share = (repeat / customers.length) * 100;
    const score = clampScore(40 + share * 1.2, 0, 100);
    dims.push({
      key: 'customers',
      score,
      weight: 0.8,
      metric: 'repeatCustomerPct',
      evidence: `${share.toFixed(0)}% of customers ordered more than once`,
      reason: share >= 25 ? 'A healthy share of customers come back.' : 'Most customers only buy once.',
      positive: share >= 30 ? `${share.toFixed(0)}% repeat customers` : null,
      negative: share < 15 ? `Only ${share.toFixed(0)}% of customers repeat` : null,
      recommendation:
        share < 25 ? 'Run a win-back on customers whose last order is older than 60 days.' : 'Retention is working.',
    });
  } else {
    dims.push(excluded('customers', 'No customer orders yet.'));
  }

  const included = dims.filter((d) => d.score !== null);
  const weightSum = included.reduce((a, d) => a + d.weight, 0);
  const score = weightSum > 0 ? included.reduce((a, d) => a + (d.score as number) * d.weight, 0) / weightSum : null;

  const band: BusinessHealth['band'] =
    score === null
      ? 'unknown'
      : score >= 80
        ? 'excellent'
        : score >= 65
          ? 'good'
          : score >= 45
            ? 'fair'
            : 'poor';

  return {
    score: score === null ? null : Math.round(score),
    band,
    dimensions: dims,
    includedCount: included.length,
    excludedCount: dims.length - included.length,
  };
}

function excluded(key: HealthDimension, reason: string): DimensionScore {
  return {
    key,
    score: null,
    weight: 0,
    evidence: reason,
    reason,
    positive: null,
    negative: null,
    recommendation: 'Add the underlying data to score this area.',
    metric: key,
  };
}

function clampScore(v: number, low: number, high: number): number {
  if (!Number.isFinite(v)) return low;
  return Math.max(low, Math.min(high, v));
}

/* ------------------------------------------------------------------ *
 * Action center (spec §22)
 * ------------------------------------------------------------------ */

export type Priority = 'critical' | 'important' | 'opportunity' | 'monitor';

export interface ActionItem {
  id: string;
  priority: Priority;
  title: string;
  metric: string;
  reason: string;
  /** money or descriptive impact; null means "cannot be reliably estimated" */
  impact: Money | null;
  impactLabel: string;
  action: string;
  to: string;
  category: string;
}

export interface ActionInput {
  metrics: PeriodMetrics;
  previous: PeriodMetrics | null;
  inventory: InventoryAnalytics;
  products: ProductProfitRow[];
  couriers: CourierRow[];
  suppliers: SupplierRow[];
  customers: CustomerRow[];
  expenses: ExpenseInsight[];
  renewals: RenewalRow[];
  settings: Settings;
  today: string;
  adGroups: { key: string; platform: string; spend: Money; roas: number | null; contribution: Money; purchases: number }[];
}

export function buildActionCenter(input: ActionInput): ActionItem[] {
  const { metrics, previous, inventory, products, settings, today } = input;
  const t = settings.thresholds;
  const pl = metrics.pl;
  const out: ActionItem[] = [];

  const push = (item: Omit<ActionItem, 'id'>) =>
    out.push({ ...item, id: fingerprint(item.title, item.metric, today) });

  /* profit drop */
  if (previous && previous.pl.netOperatingProfit > 0 && pl.netOperatingProfit < previous.pl.netOperatingProfit) {
    const drop = sub(previous.pl.netOperatingProfit, pl.netOperatingProfit);
    const pct = ((pl.netOperatingProfit - previous.pl.netOperatingProfit) / previous.pl.netOperatingProfit) * 100;
    if (isMeaningfulChange(previous.pl.netOperatingProfit, pl.netOperatingProfit, { minRelative: 0.08 })) {
      push({
        priority: 'critical',
        category: 'financial',
        title: 'Profit slipped this period',
        metric: `${pct.toFixed(1)}%`,
        reason: describeProfitDrivers(pl, previous.pl),
        impact: drop,
        impactLabel: 'lower contribution this period',
        action: 'Open Profit & Loss and review the largest changed cost lines.',
        to: '/finance',
      });
    }
  }

  /* break-even ROAS breach */
  if (metrics.ad.spend > 0 && metrics.breakEvenRoasValue !== null && (metrics.ad.roas ?? 0) < metrics.breakEvenRoasValue) {
    push({
      priority: 'critical',
      category: 'ads',
      title: 'Advertising is below break-even',
      metric: `ROAS ${(metrics.ad.roas ?? 0).toFixed(2)}× vs ${metrics.breakEvenRoasValue.toFixed(2)}×`,
      reason: 'Every purchase is currently costing more than it contributes.',
      impact: metrics.adProfit.contributionProfit < 0 ? metrics.adProfit.contributionProfit : null,
      impactLabel: 'advertising contribution this period',
      action: 'Pause the campaigns with the lowest contribution and re-test creatives.',
      to: '/ads',
    });
  }

  /* stockout risk */
  for (const row of inventory.stockoutRisk.slice(0, 3)) {
    push({
      priority: row.state === 'out' ? 'critical' : 'important',
      category: 'inventory',
      title: row.state === 'out' ? `${row.product.name} is out of stock` : `${row.product.name} is almost out of stock`,
      metric: `${row.available} left`,
      reason:
        row.daysLeft !== null
          ? `At the current sell rate this lasts about ${Math.round(row.daysLeft)} more days.`
          : 'Stock is at or below your reorder level.',
      impact: null,
      impactLabel: '',
      action: `Reorder ${row.product.reorderQuantity > 0 ? row.product.reorderQuantity : 'a fresh batch'}.`,
      to: '/inventory',
    });
  }

  /* rising courier returns */
  for (const c of input.couriers) {
    if (c.returnRatePct !== null && c.returnRatePct > t.returnRatePct && c.orders >= 5) {
      push({
        priority: 'important',
        category: 'operations',
        title: `${c.courier.name}'s return rate is high`,
        metric: `${c.returnRatePct.toFixed(1)}%`,
        reason: `It also costs ${formatUnits(c.feePerDelivered)} per delivered parcel.`,
        impact: c.returnCost,
        impactLabel: 'return cost through this courier',
        action: 'Compare courier net contribution before sending more parcels this way.',
        to: '/couriers',
      });
    }
  }

  /* renewals */
  for (const r of input.renewals.slice(0, 3)) {
    if (r.daysUntilDue > 30) continue;
    push({
      priority: r.daysUntilDue < 0 ? 'important' : 'monitor',
      category: 'renewals',
      title:
        r.daysUntilDue < 0
          ? `${r.item.name} renewal is overdue`
          : r.daysUntilDue === 0
            ? `${r.item.name} is due today`
            : `${r.item.name} renewal is due in ${r.daysUntilDue} days`,
      metric: formatUnits(r.item.amount),
      reason: `Recorded as a ${r.item.cycle} ${r.item.renewalType || 'renewal'}.`,
      impact: r.item.amount,
      impactLabel: 'when you pay it',
      action: 'Record the payment when you make it — it will not be booked automatically.',
      to: '/finance/expenses',
    });
  }

  /* high-revenue weak-margin products */
  for (const p of products.filter((x) => x.units >= t.minOrders).slice(0, 40)) {
    const margin = p.grossMarginPct ?? 0;
    if (p.revenue > 0 && margin < 15 && p.revenue > pl.netRevenue * 0.05) {
      push({
        priority: 'opportunity',
        category: 'financial',
        title: `${p.product.name} sells well with a weak margin`,
        metric: `${margin.toFixed(1)}% gross margin`,
        reason: `It is ${(p.revenue / Math.max(pl.netRevenue, 1)) * 100} of revenue but contributes little profit.`,
        impact: null,
        impactLabel: '',
        action: 'Raise the price slightly or renegotiate the buying cost.',
        to: '/products',
      });
      break;
    }
  }

  /* under-advertised high-margin product */
  const highMargin = products
    .filter((p) => (p.grossMarginPct ?? 0) >= 40 && p.adSpend === 0 && p.units >= t.minOrders)
    .sort((a, b) => b.grossProfit - a.grossProfit)[0];
  if (highMargin) {
    push({
      priority: 'opportunity',
      category: 'ads',
      title: `${highMargin.product.name} earns a strong margin with no ad spend`,
      metric: `${(highMargin.grossMarginPct ?? 0).toFixed(1)}% gross margin`,
      reason: 'It already sells without paid traffic.',
      impact: null,
      impactLabel: '',
      action: 'Test a small budget on this product and watch contribution, not ROAS.',
      to: '/ads',
    });
  }

  /* expense drift */
  for (const e of input.expenses.filter((x) => x.unusual && x.change > 0).slice(0, 2)) {
    push({
      priority: 'important',
      category: 'financial',
      title: `${e.category} spending rose sharply`,
      metric: e.changePct === null ? '' : `+${e.changePct.toFixed(0)}%`,
      reason: 'The increase is larger than normal period-over-period movement.',
      impact: e.change,
      impactLabel: 'more than the previous period',
      action: 'Open Expenses and check whether this is one-off or recurring.',
      to: '/finance/expenses',
    });
  }

  /* cash falling */
  if (previous && metrics.cash.closingCash < previous.cash.closingCash) {
    const fall = sub(previous.cash.closingCash, metrics.cash.closingCash);
    if (isMeaningfulChange(previous.cash.closingCash, metrics.cash.closingCash, { minRelative: 0.1, minAbsolute: 10000 })) {
      push({
        priority: 'important',
        category: 'financial',
        title: 'Cash balance is down',
        metric: formatUnits(fall),
        reason: 'Outflows exceeded inflows this period.',
        impact: fall,
        impactLabel: 'less cash than the previous period',
        action: 'Review cash flow and outstanding receivables.',
        to: '/finance/cash-flow',
      });
    }
  }

  /* win-back customers */
  const winBack = input.customers.filter((c) => c.segment === 'win-back').length;
  if (winBack >= 3) {
    push({
      priority: 'opportunity',
      category: 'customers',
      title: `${winBack} customers are ready for a win-back`,
      metric: `${winBack}`,
      reason: 'They bought more than once but have not ordered in over 120 days.',
      impact: null,
      impactLabel: '',
      action: 'Contact them with an offer — their past profit makes them worth chasing.',
      to: '/customers',
    });
  }

  /* supplier cost trend */
  for (const s of input.suppliers) {
    if (s.costTrendPct !== null && s.costTrendPct > 8 && s.purchaseSpend > 0) {
      push({
        priority: 'monitor',
        category: 'operations',
        title: `${s.supplier.name}'s prices are rising`,
        metric: `+${s.costTrendPct.toFixed(1)}%`,
        reason: 'Average unit cost increased between the two periods.',
        impact: null,
        impactLabel: '',
        action: 'Compare this supplier against others for the same products.',
        to: '/suppliers',
      });
      break;
    }
  }

  /* ad campaign below target */
  for (const g of input.adGroups.filter((x) => x.purchases >= settings.guardrails.minPurchases).slice(0, 3)) {
    if (g.roas !== null && g.roas < settings.guardrails.targetRoas && g.contribution < 0) {
      push({
        priority: 'important',
        category: 'ads',
        title: `${g.key} is losing money`,
        metric: `ROAS ${g.roas.toFixed(2)}×`,
        reason: 'Contribution profit is negative after every cost.',
        impact: g.contribution,
        impactLabel: 'contribution from this campaign',
        action: 'Reduce the budget and test a different creative or audience.',
        to: '/ads',
      });
    }
  }

  const order: Record<Priority, number> = { critical: 0, important: 1, opportunity: 2, monitor: 3 };
  return out.sort((a, b) => order[a.priority] - order[b.priority]);
}

function describeProfitDrivers(current: ProfitAndLoss, prev: ProfitAndLoss): string {
  const drivers: string[] = [];
  const compare = (label: string, a: Money, b: Money) => {
    const change = sub(a, b);
    if (Math.abs(change) < Math.max(1000, Math.abs(b) * 0.05)) return;
    drivers.push(`${label} ${change > 0 ? 'increased' : 'decreased'}`);
  };
  compare('Ad spend', current.variable.advertising, prev.variable.advertising);
  compare('Return cost', current.variable.returns, prev.variable.returns);
  compare('Courier cost', current.variable.courier, prev.variable.courier);
  compare('COGS', current.cogs, prev.cogs);
  compare('Operating expenses', current.operatingExpenses, prev.operatingExpenses);
  const aovNow = current.aov ?? 0;
  const aovPrev = prev.aov ?? 0;
  if (aovPrev > 0 && Math.abs((aovNow - aovPrev) / aovPrev) > 0.03) {
    drivers.push(`average order value ${aovNow >= aovPrev ? 'increased' : 'decreased'}`);
  }
  return drivers.length ? `${drivers.slice(0, 3).join(', ')}.` : 'Costs and revenue both moved this period.';
}

function formatUnits(minor: Money): string {
  return `${(minor / 100).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

/* ------------------------------------------------------------------ *
 * Profit leak detector (spec §72)
 * ------------------------------------------------------------------ */

export interface ProfitLeak {
  key: string;
  amount: Money;
  shareOfRevenuePct: number | null;
  change: Money;
  changePct: number | null;
  /** profit impact of the change vs previous period */
  profitImpact: Money;
  severity: 'high' | 'medium' | 'low';
}

export function profitLeaks(current: ProfitAndLoss, prev: ProfitAndLoss | null): ProfitLeak[] {
  const lines: { key: string; amount: Money; prevAmount: Money }[] = [
    { key: 'advertising', amount: current.variable.advertising, prevAmount: prev?.variable.advertising ?? 0 },
    { key: 'courier', amount: current.variable.courier, prevAmount: prev?.variable.courier ?? 0 },
    { key: 'packaging', amount: current.variable.packaging, prevAmount: prev?.variable.packaging ?? 0 },
    { key: 'paymentFees', amount: current.variable.paymentFees, prevAmount: prev?.variable.paymentFees ?? 0 },
    { key: 'returns', amount: current.variable.returns, prevAmount: prev?.variable.returns ?? 0 },
    { key: 'damage', amount: current.variable.damage, prevAmount: prev?.variable.damage ?? 0 },
    { key: 'discounts', amount: current.discounts, prevAmount: prev?.discounts ?? 0 },
    { key: 'cogs', amount: current.cogs, prevAmount: prev?.cogs ?? 0 },
    { key: 'operating', amount: current.operatingExpenses, prevAmount: prev?.operatingExpenses ?? 0 },
  ];

  return lines
    .filter((l) => l.amount !== 0)
    .map((l) => {
      const share = ratio(l.amount * 100, current.netRevenue);
      const change = sub(l.amount, l.prevAmount);
      const changePct = l.prevAmount > 0 ? (change / l.prevAmount) * 100 : null;
      const severity: ProfitLeak['severity'] =
        share !== null && share > 25 ? 'high' : share !== null && share > 10 ? 'medium' : 'low';
      return {
        key: l.key,
        amount: l.amount,
        shareOfRevenuePct: share,
        change,
        changePct,
        profitImpact: -change,
        severity,
      };
    })
    .sort((a, b) => b.amount - a.amount);
}

/* ------------------------------------------------------------------ *
 * Opportunity engine (spec §73)
 * ------------------------------------------------------------------ */

export interface Opportunity {
  id: string;
  title: string;
  reason: string;
  /** null when the impact cannot be reliably estimated */
  impact: Money | null;
  impactLabel: string;
  confidence: 'high' | 'medium' | 'low';
  action: string;
  to: string;
}

export interface OpportunityInput {
  metrics: PeriodMetrics;
  products: ProductProfitRow[];
  inventory: InventoryAnalytics;
  couriers: CourierRow[];
  suppliers: SupplierRow[];
  customers: CustomerRow[];
  adGroups: { key: string; spend: Money; roas: number | null; contribution: Money; purchases: number }[];
  settings: Settings;
}

export function findOpportunities(input: OpportunityInput): Opportunity[] {
  const out: Opportunity[] = [];
  const { metrics, products, inventory, settings } = input;
  const t = settings.thresholds;

  const add = (o: Omit<Opportunity, 'id'>) => out.push({ ...o, id: fingerprint(o.title, o.reason) });

  /* high-margin products */
  const highMargin = products
    .filter((p) => (p.grossMarginPct ?? 0) >= 40 && p.units >= t.minOrders)
    .sort((a, b) => (b.grossMarginPct ?? 0) - (a.grossMarginPct ?? 0))
    .slice(0, 3);
  for (const p of highMargin) {
    add({
      title: `${p.product.name} has a strong margin`,
      reason: `${(p.grossMarginPct ?? 0).toFixed(1)}% gross margin across ${p.units} units.`,
      impact: null,
      impactLabel: '',
      confidence: 'high',
      action: 'Give it more visibility — a bundle or a small ad test.',
      to: '/products',
    });
  }

  /* under-advertised */
  const underAdvertised = products
    .filter((p) => p.adSpend === 0 && (p.grossMarginPct ?? 0) >= 35 && p.units >= t.minOrders)
    .slice(0, 3);
  for (const p of underAdvertised) {
    add({
      title: `${p.product.name} sells without any ad spend`,
      reason: 'It already produces contribution with zero paid traffic.',
      impact: null,
      impactLabel: '',
      confidence: 'medium',
      action: 'Test a small daily budget and watch contribution profit, not ROAS.',
      to: '/ads',
    });
  }

  /* low-return products */
  const lowReturn = products
    .filter((p) => p.returnRatePct !== null && p.returnRatePct <= 2 && p.units >= 10)
    .slice(0, 2);
  for (const p of lowReturn) {
    add({
      title: `${p.product.name} almost never comes back`,
      reason: `Only ${(p.returnRatePct ?? 0).toFixed(1)}% return rate.`,
      impact: null,
      impactLabel: '',
      confidence: 'medium',
      action: 'Prioritise it for scaling — returns are usually the hidden cost.',
      to: '/products',
    });
  }

  /* better courier */
  const ranked = input.couriers.filter((c) => c.orders >= 5);
  if (ranked.length >= 2) {
    const best = ranked[0];
    const worst = ranked[ranked.length - 1];
    if (best.feePerDelivered < worst.feePerDelivered) {
      const diff = roundMinor((worst.feePerDelivered - best.feePerDelivered) * worst.delivered);
      add({
        title: `${best.courier.name} is cheaper per delivered parcel than ${worst.courier.name}`,
        reason: `${worst.delivered} parcels went through the more expensive option.`,
        impact: diff > 0 ? diff : null,
        impactLabel: 'if those parcels had used the cheaper courier',
        confidence: diff > 0 ? 'medium' : 'low',
        action: 'Check service quality before switching, then move volume gradually.',
        to: '/couriers',
      });
    }
  }

  /* dead stock */
  if (inventory.deadStockValue > 0) {
    add({
      title: 'Dead stock is holding capital',
      reason: `${inventory.deadStock.length} products have not sold in ${t.deadStockDays}+ days.`,
      impact: inventory.deadStockValue,
      impactLabel: 'tied up in stock that is not selling',
      confidence: 'high',
      action: 'Bundle or discount it rather than buying more.',
      to: '/inventory',
    });
  }

  /* stockout on fast movers */
  const fastAtRisk = inventory.fastMovers.filter((f) =>
    inventory.stockoutRisk.some((s) => s.product.id === f.product.id),
  );
  for (const f of fastAtRisk.slice(0, 2)) {
    add({
      title: `${f.product.name} is selling fast and running low`,
      reason: `${f.unitsSold} sold this period with ${f.available} left.`,
      impact: null,
      impactLabel: '',
      confidence: 'high',
      action: `Reorder before it stocks out${f.daysLeft !== null ? ` (about ${Math.round(f.daysLeft)} days left)` : ''}.`,
      to: '/inventory',
    });
  }

  /* price increase on inelastic sellers */
  const priceCandidates = products
    .filter((p) => p.units >= 10 && (p.grossMarginPct ?? 0) < 25 && (p.returnRatePct ?? 0) < 5)
    .slice(0, 2);
  for (const p of priceCandidates) {
    add({
      title: `${p.product.name} may support a small price increase`,
      reason: 'Steady demand, low returns, but a thin margin.',
      impact: null,
      impactLabel: '',
      confidence: 'low',
      action: 'Test +5% and watch order volume for two weeks.',
      to: '/insights/what-if',
    });
  }

  /* profitable campaign scaling */
  for (const g of input.adGroups.filter((x) => x.purchases >= settings.guardrails.minPurchases).slice(0, 5)) {
    if (
      g.roas !== null &&
      g.roas >= settings.guardrails.targetRoas &&
      g.contribution > 0
    ) {
      const step = settings.guardrails.maxBudgetStepPct;
      add({
        title: `${g.key} can take a small budget increase`,
        reason: `ROAS ${g.roas.toFixed(2)}× with positive contribution on ${g.purchases} purchases.`,
        impact: null,
        impactLabel: '',
        confidence: 'medium',
        action: `Increase the budget by no more than ${step}% and re-check after the observation window.`,
        to: '/ads/budget',
      });
    }
  }

  /* high-value customers */
  const vip = input.customers.filter((c) => c.segment === 'vip').length;
  if (vip > 0) {
    add({
      title: `${vip} customers are driving repeat profit`,
      reason: 'They order frequently and contribute positively.',
      impact: null,
      impactLabel: '',
      confidence: 'medium',
      action: 'Keep them close — a small loyalty gesture costs less than a new acquisition.',
      to: '/customers',
    });
  }

  /* cheaper supplier */
  const supplierCandidates = input.suppliers.filter((s) => s.costTrendPct !== null && s.costTrendPct > 5);
  for (const s of supplierCandidates.slice(0, 1)) {
    add({
      title: `${s.supplier.name}'s costs are rising`,
      reason: `Average unit cost up ${(s.costTrendPct ?? 0).toFixed(1)}%.`,
      impact: null,
      impactLabel: '',
      confidence: 'low',
      action: 'Compare per-product prices with your other suppliers.',
      to: '/suppliers',
    });
  }

  void metrics;
  return out;
}

/* ------------------------------------------------------------------ *
 * Notifications (spec §78) — derived, never stored copies of facts
 * ------------------------------------------------------------------ */

export interface DerivedNotification {
  id: string;
  category:
    | 'financial'
    | 'inventory'
    | 'orders'
    | 'customers'
    | 'ads'
    | 'operations'
    | 'renewals'
    | 'opportunities'
    | 'risks';
  priority: 'critical' | 'important' | 'informational' | 'opportunity';
  title: string;
  body: string;
  to: string;
}

export function deriveNotifications(actions: ActionItem[], opportunities: Opportunity[]): DerivedNotification[] {
  const fromActions = actions.map<DerivedNotification>((a) => ({
    id: a.id,
    category: a.category as DerivedNotification['category'],
    priority: a.priority === 'monitor' ? 'informational' : a.priority,
    title: a.title,
    body: `${a.reason}${a.action ? ` ${a.action}` : ''}`,
    to: a.to,
  }));
  const fromOpportunities = opportunities.slice(0, 5).map<DerivedNotification>((o) => ({
    id: o.id,
    category: 'opportunities',
    priority: 'opportunity',
    title: o.title,
    body: `${o.reason} ${o.action}`,
    to: o.to,
  }));
  return [...fromActions, ...fromOpportunities];
}

/* ------------------------------------------------------------------ *
 * Concentration risk (spec §81)
 * ------------------------------------------------------------------ */

export interface ConcentrationRisk {
  key: string;
  topSharePct: number | null;
  top3SharePct: number | null;
  topName: string | null;
  concentrated: boolean;
}

export function concentrationRisks(input: {
  products: { name: string; revenue: number }[];
  customers: { name: string; revenue: number }[];
  channels: { name: string; revenue: number }[];
  suppliers: { name: string; spend: number }[];
  platforms: { name: string; spend: number }[];
  thresholdPct: number;
}): ConcentrationRisk[] {
  const build = (
    key: string,
    rows: { name: string; revenue?: number; spend?: number }[],
  ): ConcentrationRisk => {
    const values = rows.map((r) => r.revenue ?? r.spend ?? 0).filter((v) => v > 0);
    const sorted = [...rows].sort((a, b) => (b.revenue ?? b.spend ?? 0) - (a.revenue ?? a.spend ?? 0));
    const top = topShare(values, 1);
    const top3 = topShare(values, 3);
    return {
      key,
      topSharePct: values.length ? top * 100 : null,
      top3SharePct: values.length ? top3 * 100 : null,
      topName: sorted[0]?.name ?? null,
      concentrated: values.length > 1 && top * 100 >= input.thresholdPct,
    };
  };
  return [
    build('product', input.products),
    build('customer', input.customers),
    build('channel', input.channels),
    build('supplier', input.suppliers),
    build('platform', input.platforms),
  ];
}

/* ------------------------------------------------------------------ *
 * Goals (spec §80)
 * ------------------------------------------------------------------ */

export interface GoalProgress {
  id: string;
  metric: string;
  target: number;
  actual: number;
  remaining: number;
  /** per-day pace required to hit the target */
  requiredPace: number;
  projected: number;
  achievedPct: number | null;
  onTrack: boolean;
  unit: 'money' | 'count' | 'percent' | 'multiple';
}

export function goalProgress(
  goals: { id: string; metric: string; target: number; active: boolean; period: string }[],
  metrics: PeriodMetrics,
  range: DateRange,
  todayISO: string,
): GoalProgress[] {
  return goals
    .filter((g) => g.active)
    .map((g) => {
      const actual = actualForMetric(g.metric, metrics);
      const unit = unitForMetric(g.metric);
      const daysElapsed = Math.max(1, Math.min(range.days, daysBetweenISO(range.start, todayISO) + 1));
      const daysLeft = Math.max(0, range.days - daysElapsed);
      const daily = actual / daysElapsed;
      const projected = actual + daily * daysLeft;
      const achieved = ratio(actual * 100, g.target);
      return {
        id: g.id,
        metric: g.metric,
        target: g.target,
        actual,
        remaining: g.target - actual,
        requiredPace: daysLeft > 0 ? (g.target - actual) / daysLeft : 0,
        projected,
        achievedPct: achieved,
        onTrack: projected >= g.target,
        unit,
      };
    });
}

function actualForMetric(metric: string, m: PeriodMetrics): number {
  switch (metric) {
    case 'revenue':
      return m.pl.netRevenue / 100;
    case 'profit':
      return m.pl.netOperatingProfit / 100;
    case 'orders':
      return m.pl.orders;
    case 'netMarginPct':
      return m.pl.netMarginPct ?? 0;
    case 'roas':
      return m.ad.roas ?? 0;
    case 'cac':
      return m.ad.cac ?? 0;
    case 'aov':
      return m.pl.aov ?? 0;
    case 'customers':
      return m.newCustomers;
    default:
      return 0;
  }
}

function unitForMetric(metric: string): GoalProgress['unit'] {
  switch (metric) {
    case 'revenue':
    case 'profit':
    case 'aov':
    case 'cac':
      return 'money';
    case 'netMarginPct':
      return 'percent';
    case 'roas':
      return 'multiple';
    default:
      return 'count';
  }
}

function daysBetweenISO(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

/* ------------------------------------------------------------------ *
 * Forecasting (spec §70)
 * ------------------------------------------------------------------ */

export interface ForecastOutput {
  metric: string;
  points: { date: string; value: number }[];
  lower: { date: string; value: number }[];
  upper: { date: string; value: number }[];
  historyUsed: number;
  confidence: number;
  mape: number | null;
  assumptions: string[];
  limitations: string[];
  sufficient: boolean;
}

export function forecastMetric(
  history: TrendPoint[],
  pick: (p: TrendPoint) => number,
  horizonDays: number,
  metricName: string,
): ForecastOutput {
  const series = history.map(pick);
  const result = forecast(series, horizonDays, { minPoints: 8 });
  const last = history[history.length - 1];

  if (!result || !last) {
    return {
      metric: metricName,
      points: [],
      lower: [],
      upper: [],
      historyUsed: series.length,
      confidence: 0,
      mape: null,
      assumptions: [],
      limitations: ['Fewer than 8 days of history — forecasting is not possible yet.'],
      sufficient: false,
    };
  }

  const points = result.points.map((v, i) => ({ date: addDays(last.date, i + 1), value: v }));
  const lower = result.lower.map((v, i) => ({ date: addDays(last.date, i + 1), value: v }));
  const upper = result.upper.map((v, i) => ({ date: addDays(last.date, i + 1), value: v }));
  const confidence = result.mape === null ? 40 : Math.max(20, Math.min(95, 100 - result.mape));

  return {
    metric: metricName,
    points,
    lower,
    upper,
    historyUsed: result.historyUsed,
    confidence: Math.round(confidence),
    mape: result.mape,
    assumptions: [
      'Exponential smoothing over your own recorded history.',
      'Seasonality is not modelled — weekly and campaign cycles are not captured.',
      'Ad spend, stock levels and prices are assumed to stay as they are now.',
    ],
    limitations: [
      'This is an estimate, not a promise.',
      'Unusual days (campaigns, holidays) pull the estimate.',
      'Confidence falls sharply when history is short.',
    ],
    sufficient: true,
  };
}

/* ------------------------------------------------------------------ *
 * What-if (spec §69 / §108)
 * ------------------------------------------------------------------ */

export interface WhatIfInput {
  pricePct: number;
  discountPct: number;
  adSpendPct: number;
  roasPct: number;
  cogsPct: number;
  courierPct: number;
  packagingPct: number;
  returnRatePct: number;
  paymentFeePct: number;
  volumePct: number;
}

export interface WhatIfOutput {
  revenue: Money;
  orders: number;
  grossProfit: Money;
  contributionProfit: Money;
  netProfit: Money;
  marginPct: number | null;
  cashImpact: Money;
}

export const NEUTRAL_SCENARIO: WhatIfInput = {
  pricePct: 0,
  discountPct: 0,
  adSpendPct: 0,
  roasPct: 0,
  cogsPct: 0,
  courierPct: 0,
  packagingPct: 0,
  returnRatePct: 0,
  paymentFeePct: 0,
  volumePct: 0,
};

/**
 * Apply a scenario to the actual period.
 * Volume responds to price with a configurable elasticity (default −1.2), which
 * is stated as an assumption rather than presented as a fact.
 */
export function whatIf(base: ProfitAndLoss, adSpend: Money, scenario: WhatIfInput, elasticity = -1.2): WhatIfOutput {
  const priceFactor = 1 + scenario.pricePct / 100;
  const volumeFactor = Math.max(0, 1 + (scenario.pricePct / 100) * elasticity + scenario.volumePct / 100);

  const grossRevenue = roundMinor(base.grossRevenue * priceFactor * volumeFactor);
  const discounts = roundMinor(base.discounts * volumeFactor + grossRevenue * (scenario.discountPct / 100));
  const netRevenue = Math.max(0, grossRevenue - discounts + base.shippingIncome);
  const cogs = roundMinor(base.cogs * (1 + scenario.cogsPct / 100) * volumeFactor);
  const grossProfit = netRevenue - cogs;

  const courier = roundMinor(base.variable.courier * (1 + scenario.courierPct / 100) * volumeFactor);
  const packaging = roundMinor(base.variable.packaging * (1 + scenario.packagingPct / 100) * volumeFactor);
  const paymentFees = roundMinor(
    base.variable.paymentFees * (1 + scenario.paymentFeePct / 100) * volumeFactor,
  );
  const advertising = roundMinor(adSpend * (1 + scenario.adSpendPct / 100) * (1 + scenario.roasPct / 100));
  const returns = roundMinor(base.variable.returns * (1 + scenario.returnRatePct / 100) * volumeFactor);
  const other = roundMinor((base.variable.damage + base.variable.otherVariable) * volumeFactor);

  const contributionProfit = sub(
    netRevenue,
    cogs,
    courier,
    packaging,
    paymentFees,
    advertising,
    returns,
    other,
  );
  const netProfit = sub(contributionProfit, base.operatingExpenses);

  return {
    revenue: netRevenue,
    orders: Math.round(base.orders * volumeFactor),
    grossProfit,
    contributionProfit,
    netProfit,
    marginPct: ratio(netProfit * 100, netRevenue),
    cashImpact: sub(netProfit, sub(base.netOperatingProfit, 0)),
  };
}

/* ------------------------------------------------------------------ *
 * Ad group summaries used by insights
 * ------------------------------------------------------------------ */

export interface AdGroupSummary {
  key: string;
  platform: string;
  spend: Money;
  revenue: Money;
  purchases: number;
  roas: number | null;
  contribution: Money;
  cpa: number | null;
}

export function summariseAdGroups(
  groups: { key: string; platform: string; metrics: AdMetrics; profit?: AdProfitability }[],
): AdGroupSummary[] {
  return groups.map((g) => ({
    key: g.key,
    platform: g.platform,
    spend: g.metrics.spend,
    revenue: g.metrics.revenue,
    purchases: g.metrics.purchases,
    roas: g.metrics.roas,
    contribution: g.profit?.contributionProfit ?? 0,
    cpa: g.metrics.cpa,
  }));
}

/* ------------------------------------------------------------------ *
 * Small helpers
 * ------------------------------------------------------------------ */

export function revenueTrendDirection(points: TrendPoint[]): 'up' | 'down' | 'flat' | 'unknown' {
  const slope = linearSlope(points.map((p) => p.netRevenue));
  if (slope === null) return 'unknown';
  const avg = points.reduce((a, p) => a + p.netRevenue, 0) / Math.max(points.length, 1);
  if (avg === 0) return 'unknown';
  const relative = slope / avg;
  if (relative > 0.02) return 'up';
  if (relative < -0.02) return 'down';
  return 'flat';
}

export function totalAdSpend(groups: AdGroupSummary[]): Money {
  return sum(groups.map((g) => g.spend));
}

export function beRoas(cmPct: number | null): number | null {
  return breakEvenRoas(cmPct);
}

export function cashConversion(cash: CashFlow, pl: ProfitAndLoss): number | null {
  if (pl.netOperatingProfit === 0) return null;
  return ((cash.operatingIn - cash.operatingOut) / pl.netOperatingProfit) * 100;
}

export function fixedCostRatio(pl: ProfitAndLoss): number | null {
  return ratio(pl.operatingExpenses * 100, pl.netRevenue);
}

export function variableCostRatio(pl: ProfitAndLoss): number | null {
  const variable = add(pl.cogs, pl.variableTotal);
  return ratio(variable * 100, pl.netRevenue);
}

export function positionsSummary(positions: Positions): { label: string; value: Money }[] {
  return [
    { label: 'cash', value: positions.cash },
    { label: 'receivables', value: positions.receivables },
    { label: 'payables', value: positions.payables },
    { label: 'inventory', value: positions.inventoryValue },
    { label: 'pendingCod', value: positions.pendingCod },
    { label: 'pendingSettlement', value: positions.pendingSettlement },
  ];
}

export function breakEvenSummary(be: BreakEven): { label: string; value: Money | null }[] {
  return [
    { label: 'fixedCosts', value: be.fixedCosts },
    { label: 'variableCosts', value: be.variableCosts },
    { label: 'breakEvenRevenue', value: be.breakEvenRevenue },
    { label: 'revenueGap', value: be.revenueGap },
  ];
}

export type { Thresholds };
