/**
 * Insights hook — one place where the intelligence layer is invoked, so the
 * dashboard, insights page and notification centre always agree.
 */
import { useMemo } from 'react';
import { useWorkspace } from './workspace';
import {
  buildActionCenter,
  businessHealthScore,
  concentrationRisks,
  deriveNotifications,
  findOpportunities,
  forecastMetric,
  goalProgress,
  profitLeaks,
  type ActionItem,
  type BusinessHealth,
  type ConcentrationRisk,
  type DerivedNotification,
  type ForecastOutput,
  type GoalProgress,
  type Opportunity,
  type ProfitLeak,
} from '../domain/intelligence';
import { groupAds, type AdGroup } from '../domain/ads';
import { adDecision, adProfitability, breakEvenRoas } from '../domain/ads';
import { contributionMarginBeforeAds } from '../domain/ads';
import { roundMinor, sum } from '../lib/money';
import type { AdRow, NotificationState } from '../domain/types';

export interface AdCampaignRow {
  key: string;
  platform: string;
  spend: number;
  revenue: number;
  purchases: number;
  roas: number | null;
  contribution: number;
  rows: AdRow[];
  group: AdGroup;
  decision: ReturnType<typeof adDecision>;
}

export interface Insights {
  health: BusinessHealth;
  actions: ActionItem[];
  opportunities: Opportunity[];
  notifications: DerivedNotification[];
  leaks: ProfitLeak[];
  goals: GoalProgress[];
  concentration: ConcentrationRisk[];
  forecast: {
    revenue: ForecastOutput;
    profit: ForecastOutput;
    orders: ForecastOutput;
  } | null;
  campaigns: AdCampaignRow[];
  notificationStates: Map<string, NotificationState>;
  adPlatformGroups: AdGroup[];
}

export function useInsights(): Insights | null {
  const { analytics, data, settings, range, today } = useWorkspace();

  return useMemo<Insights | null>(() => {
    if (!analytics || !data || !settings) return null;
    const { metrics, previous, inventory, products, customers, couriers, suppliers, expenses, renewals, trend } =
      analytics;

    const health = businessHealthScore({ metrics, previous, inventory, customers, settings });

    const cmBeforeAds = contributionMarginBeforeAds({
      netRevenue: metrics.pl.netRevenue,
      cogs: metrics.pl.cogs,
      courier: metrics.pl.variable.courier,
      packaging: metrics.pl.variable.packaging,
      paymentFees: metrics.pl.variable.paymentFees,
      returnCost: metrics.pl.variable.returns,
      otherVariable: metrics.pl.variable.otherVariable,
    });

    const campaignGroups = groupAds(analytics.period.adRows, 'campaign', range.days);
    const campaigns: AdCampaignRow[] = campaignGroups.map((g) => {
      const adRevenueShare = metrics.pl.netRevenue > 0 ? Math.min(1, g.metrics.revenue / metrics.pl.netRevenue) : 0;
      const profit = adProfitability({
        revenue: g.metrics.revenue,
        adSpend: g.metrics.spend,
        cogs: sum(g.rows.map((r) => roundMinor((unitCostFor(r, data) ) * r.purchases))),
        courier: roundMinor(metrics.pl.variable.courier * adRevenueShare),
        packaging: roundMinor(metrics.pl.variable.packaging * adRevenueShare),
        paymentFees: roundMinor(metrics.pl.variable.paymentFees * adRevenueShare),
        returnCost: roundMinor(metrics.pl.variable.returns * adRevenueShare),
        damage: 0,
        otherVariable: 0,
        operatingAllocation: roundMinor(metrics.pl.operatingExpenses * adRevenueShare),
      });
      const returnRate = metrics.returnRatePct;
      const decision = adDecision({
        metrics: g.metrics,
        profit,
        returnRatePct: returnRate,
        guardrails: settings.guardrails,
      });
      return {
        key: g.key,
        platform: g.rows[0]?.platform ?? 'other',
        spend: g.metrics.spend,
        revenue: g.metrics.revenue,
        purchases: g.metrics.purchases,
        roas: g.metrics.roas,
        contribution: profit.contributionProfit,
        rows: g.rows,
        group: g,
        decision,
      };
    });

    const actions = buildActionCenter({
      metrics,
      previous,
      inventory,
      products,
      couriers,
      suppliers,
      customers,
      expenses,
      renewals,
      settings,
      today,
      adGroups: campaigns.map((c) => ({
        key: c.key,
        platform: c.platform,
        spend: c.spend,
        roas: c.roas,
        contribution: c.contribution,
        purchases: c.purchases,
      })),
    });

    const opportunities = findOpportunities({
      metrics,
      products,
      inventory,
      couriers,
      suppliers,
      customers,
      adGroups: campaigns.map((c) => ({
        key: c.key,
        spend: c.spend,
        roas: c.roas,
        contribution: c.contribution,
        purchases: c.purchases,
      })),
      settings,
    });

    const notifications = deriveNotifications(actions, opportunities);

    const leaks = previous ? profitLeaks(metrics.pl, previous.pl) : profitLeaks(metrics.pl, null);

    const goals = goalProgress(
      data.goals.map((g) => ({
        id: g.id,
        metric: g.metric,
        target: g.target,
        active: g.active,
        period: g.period,
      })),
      metrics,
      range,
      today,
    );

    const channelRevenue = new Map<string, number>();
    for (const order of analytics.period.orders) {
      const items = analytics.period.orderItems.filter((i) => i.orderId === order.id);
      const revenue = items.reduce((a, i) => a + (i.unitPrice * i.qty) / 100, 0);
      channelRevenue.set(order.channel, (channelRevenue.get(order.channel) ?? 0) + revenue);
    }
    const platformSpend = new Map<string, number>();
    for (const row of analytics.period.adRows) {
      platformSpend.set(row.platform, (platformSpend.get(row.platform) ?? 0) + row.spend / 100);
    }

    const concentration = concentrationRisks({
      products: products.map((p) => ({ name: p.product.name, revenue: p.netRevenue / 100 })),
      customers: customers.map((c) => ({ name: c.customer.name, revenue: c.revenue / 100 })),
      channels: [...channelRevenue.entries()].map(([name, revenue]) => ({ name, revenue })),
      suppliers: suppliers.map((s) => ({ name: s.supplier.name, spend: s.purchaseSpend / 100 })),
      platforms: [...platformSpend.entries()].map(([name, spend]) => ({ name, spend })),
      thresholdPct: settings.thresholds.concentrationPct,
    });

    const forecast =
      trend.length >= 8
        ? {
            revenue: forecastMetric(trend, (p) => p.netRevenue / 100, 14, 'revenue'),
            profit: forecastMetric(trend, (p) => p.netProfit / 100, 14, 'profit'),
            orders: forecastMetric(trend, (p) => p.orders, 14, 'orders'),
          }
        : null;

    const notificationStates = new Map(data.notificationStates.map((n) => [n.id, n]));

    void cmBeforeAds;
    void breakEvenRoas;

    return {
      health,
      actions,
      opportunities,
      notifications,
      leaks,
      goals,
      concentration,
      forecast,
      campaigns,
      notificationStates,
      adPlatformGroups: groupAds(analytics.period.adRows, 'platform', range.days),
    };
  }, [analytics, data, settings, range, today]);
}

function unitCostFor(row: AdRow, data: { products: { id: string; sku: string; buyingPrice: number }[] }): number {
  if (row.productId) {
    const p = data.products.find((x) => x.id === row.productId);
    if (p) return p.buyingPrice;
  }
  if (row.sku) {
    const p = data.products.find((x) => x.sku === row.sku);
    if (p) return p.buyingPrice;
  }
  return 0;
}
