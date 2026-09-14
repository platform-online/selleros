import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useI18n } from '../i18n';
import { useWorkspace } from '../state/workspace';
import { useInsights } from '../state/insights';
import { useFmt } from '../state/format';
import { PageHeader } from '../components/layout/PageHeader';
import { PeriodPicker } from '../components/layout/PeriodPicker';
import { Bar, Button, Card, Chip, EmptyState, KeyValue, Metric, Modal, SkeletonMetricRow, Switch, Tabs, TabPanel } from '../components/ui/primitives';
import { DataTable } from '../components/ui/DataTable';
import { DonutChart, HorizontalBarChart, Sparkline, TrendChart, type Series } from '../components/charts/Charts';
import { absoluteChange, percentChange } from '../lib/money';
import { toChartMoney } from '../components/charts/Charts';
import type { WidgetPref, WidgetPreset } from '../domain/types';
import { db } from '../db';
import type { Money } from '../lib/money';
import { IconBell, IconChevronRight, IconSpark, IconTarget } from '../components/ui/icons';

/* ------------------------------------------------------------------ *
 * Widget library (spec §20)
 * ------------------------------------------------------------------ */

type WidgetId =
  | 'health'
  | 'profitPulse'
  | 'revenueMomentum'
  | 'netMargin'
  | 'cashPosition'
  | 'cashRunway'
  | 'breakEven'
  | 'profitLeak'
  | 'expenseDrift'
  | 'contributionMargin'
  | 'fixedCostRatio'
  | 'cashConversion'
  | 'receivables'
  | 'payables'
  | 'topProducts'
  | 'profitKillers'
  | 'silentWinners'
  | 'aov'
  | 'orderMomentum'
  | 'customerGrowth'
  | 'inventoryValue'
  | 'stockoutRisk'
  | 'deadStock'
  | 'slowMovers'
  | 'fastMovers'
  | 'reorderRadar'
  | 'overstock'
  | 'adHealth'
  | 'roasTrend'
  | 'cacTrend'
  | 'cpaTrend'
  | 'spendVsRevenue'
  | 'creativeWinners'
  | 'productAdProfit'
  | 'scalingOpportunities'
  | 'budgetEfficiency'
  | 'courierEfficiency'
  | 'returnHeatmap'
  | 'deliverySuccess'
  | 'supplierPerformance'
  | 'renewalRadar'
  | 'goals'
  | 'concentrationRisk'
  | 'growthMomentum'
  | 'whatIf'
  | 'forecast';

const WIDGET_LABEL: Record<WidgetId, string> = {
  health: 'widget.health',
  profitPulse: 'widget.profitPulse',
  revenueMomentum: 'widget.revenueMomentum',
  netMargin: 'widget.netMargin',
  cashPosition: 'widget.cashPosition',
  cashRunway: 'widget.cashRunway',
  breakEven: 'widget.breakEvenProgress',
  profitLeak: 'widget.profitLeak',
  expenseDrift: 'widget.expenseDrift',
  contributionMargin: 'widget.contributionMargin',
  fixedCostRatio: 'widget.fixedCostRatio',
  cashConversion: 'widget.cashConversion',
  receivables: 'widget.receivables',
  payables: 'widget.payables',
  topProducts: 'widget.topProducts',
  profitKillers: 'widget.profitKillers',
  silentWinners: 'widget.silentWinners',
  aov: 'widget.aov',
  orderMomentum: 'widget.orderMomentum',
  customerGrowth: 'widget.customerGrowth',
  inventoryValue: 'widget.inventoryValue',
  stockoutRisk: 'widget.stockoutRisk',
  deadStock: 'widget.deadStock',
  slowMovers: 'widget.slowMovers',
  fastMovers: 'widget.fastMovers',
  reorderRadar: 'widget.reorderRadar',
  overstock: 'widget.overstock',
  adHealth: 'widget.adHealth',
  roasTrend: 'widget.roasTrend',
  cacTrend: 'widget.cacTrend',
  cpaTrend: 'widget.cpaTrend',
  spendVsRevenue: 'widget.spendVsRevenue',
  creativeWinners: 'widget.creativeWinners',
  productAdProfit: 'widget.productAdProfit',
  scalingOpportunities: 'widget.scalingOpportunities',
  budgetEfficiency: 'widget.budgetEfficiency',
  courierEfficiency: 'widget.courierEfficiency',
  returnHeatmap: 'widget.returnHeatmap',
  deliverySuccess: 'widget.deliverySuccess',
  supplierPerformance: 'widget.supplierPerformance',
  renewalRadar: 'widget.renewalRadar',
  goals: 'widget.goals',
  concentrationRisk: 'widget.concentrationRisk',
  growthMomentum: 'widget.growthMomentum',
  whatIf: 'widget.whatIf',
  forecast: 'widget.forecast',
};

const PRESETS: Record<WidgetPreset, WidgetId[]> = {
  executive: [
    'health',
    'profitPulse',
    'revenueMomentum',
    'cashPosition',
    'cashRunway',
    'topProducts',
    'profitKillers',
    'adHealth',
    'goals',
    'concentrationRisk',
    'forecast',
  ],
  finance: [
    'profitPulse',
    'profitLeak',
    'expenseDrift',
    'contributionMargin',
    'fixedCostRatio',
    'cashConversion',
    'receivables',
    'payables',
    'breakEven',
    'netMargin',
  ],
  sales: ['topProducts', 'silentWinners', 'profitKillers', 'aov', 'orderMomentum', 'customerGrowth', 'returnHeatmap'],
  ads: [
    'adHealth',
    'roasTrend',
    'cacTrend',
    'cpaTrend',
    'spendVsRevenue',
    'creativeWinners',
    'productAdProfit',
    'scalingOpportunities',
    'budgetEfficiency',
  ],
  operations: [
    'courierEfficiency',
    'returnHeatmap',
    'deliverySuccess',
    'supplierPerformance',
    'renewalRadar',
    'stockoutRisk',
    'deadStock',
    'inventoryValue',
  ],
  minimal: ['health', 'profitPulse', 'cashPosition', 'topProducts'],
};

const ALL_WIDGETS = Object.keys(WIDGET_LABEL) as WidgetId[];

function defaultPrefs(preset: WidgetPreset): WidgetPref[] {
  return ALL_WIDGETS.map((id, index) => ({
    id,
    visible: PRESETS[preset].includes(id),
    order: PRESETS[preset].includes(id) ? PRESETS[preset].indexOf(id) : 100 + index,
    size: ['health', 'profitPulse', 'forecast', 'productAdProfit', 'spendVsRevenue', 'roasTrend'].includes(id)
      ? 'lg'
      : 'md',
  }));
}

/* ------------------------------------------------------------------ *
 * Dashboard
 * ------------------------------------------------------------------ */

export function DashboardPage() {
  const { t } = useI18n();
  const fmt = useFmt();
  const { settings, run, analytics, loading, business } = useWorkspace();
  const insights = useInsights();
  const navigate = useNavigate();
  const [customize, setCustomize] = useState(false);
  const [tab, setTab] = useState('money');

  const prefs = settings?.widgets.length ? settings.widgets : defaultPrefs(settings?.dashboardPreset ?? 'executive');
  const visible = useMemo(
    () => [...prefs].filter((p) => p.visible).sort((a, b) => a.order - b.order),
    [prefs],
  );

  const savePrefs = async (next: WidgetPref[]) => {
    if (!settings) return;
    await run(async () => {
      await db.settings.put({ ...settings, widgets: next });
    });
  };

  if (loading || !analytics || !settings) {
    return (
      <>
        <PageHeader title={t('dashboard.title')} subtitle={t('dashboard.subtitle')} />
        <SkeletonMetricRow count={8} />
      </>
    );
  }

  const { metrics, previous, trend, products, inventory, couriers, customers } = analytics;
  const pl = metrics.pl;
  const prev = previous?.pl;

  const kpis = [
    { key: 'revenue', label: t('kpi.revenue'), value: fmt.money(pl.grossRevenue), cur: pl.grossRevenue, prv: prev?.grossRevenue, to: '/sales' },
    { key: 'netRevenue', label: t('kpi.netRevenue'), value: fmt.money(pl.netRevenue), cur: pl.netRevenue, prv: prev?.netRevenue, to: '/finance/pnl' },
    { key: 'grossProfit', label: t('kpi.grossProfit'), value: fmt.money(pl.grossProfit), cur: pl.grossProfit, prv: prev?.grossProfit, to: '/finance/pnl' },
    { key: 'netProfit', label: t('kpi.netProfit'), value: fmt.money(pl.netOperatingProfit), cur: pl.netOperatingProfit, prv: prev?.netOperatingProfit, to: '/finance/pnl' },
    { key: 'grossMargin', label: t('kpi.grossMargin'), value: fmt.pct(pl.grossMarginPct), cur: pl.grossMarginPct ?? null, prv: prev?.grossMarginPct ?? null, to: '/finance/analysis' },
    { key: 'netMargin', label: t('kpi.netMargin'), value: fmt.pct(pl.netMarginPct), cur: pl.netMarginPct ?? null, prv: prev?.netMarginPct ?? null, to: '/finance/analysis' },
    { key: 'orders', label: t('kpi.orders'), value: fmt.num(pl.orders), cur: pl.orders, prv: prev?.orders, to: '/orders' },
    { key: 'units', label: t('kpi.unitsSold'), value: fmt.num(pl.units), cur: pl.units, prv: prev?.units, to: '/sales' },
    { key: 'aov', label: t('kpi.aov'), value: pl.aov === null ? '—' : fmt.money(Math.round(pl.aov * 100)), cur: (pl.aov ?? 0) * 100, prv: (prev?.aov ?? 0) * 100, to: '/sales' },
    { key: 'cogs', label: t('kpi.cogs'), value: fmt.money(pl.cogs), cur: pl.cogs, prv: prev?.cogs, to: '/finance/pnl' },
    { key: 'adSpend', label: t('kpi.adSpend'), value: fmt.money(metrics.ad.spend), cur: metrics.ad.spend, prv: previous?.ad.spend, to: '/ads' },
    { key: 'adRevenue', label: t('kpi.adRevenue'), value: fmt.money(metrics.ad.revenue), cur: metrics.ad.revenue, prv: previous?.ad.revenue, to: '/ads' },
    { key: 'roas', label: t('kpi.roas'), value: fmt.multiple(metrics.ad.roas), cur: metrics.ad.roas ?? null, prv: previous?.ad.roas ?? null, to: '/ads' },
    { key: 'mer', label: t('kpi.mer'), value: fmt.multiple(metrics.mer), cur: metrics.mer ?? null, prv: previous?.mer ?? null, to: '/ads' },
    { key: 'cash', label: t('kpi.cash'), value: fmt.money(metrics.cash.closingCash), cur: metrics.cash.closingCash, prv: previous?.cash.closingCash, to: '/finance/cash-flow' },
    { key: 'receivables', label: t('kpi.receivables'), value: fmt.money(metrics.positions.receivables), cur: metrics.positions.receivables, prv: previous?.positions.receivables, to: '/finance/receivables' },
    { key: 'payables', label: t('kpi.payables'), value: fmt.money(metrics.positions.payables), cur: metrics.positions.payables, prv: previous?.positions.payables, to: '/finance/payables' },
    { key: 'inventory', label: t('kpi.inventoryValue'), value: fmt.money(metrics.inventoryValue), cur: metrics.inventoryValue, prv: previous?.inventoryValue, to: '/inventory' },
    { key: 'returnRate', label: t('kpi.returnRate'), value: fmt.pct(metrics.returnRatePct), cur: metrics.returnRatePct ?? null, prv: previous?.returnRatePct ?? null, to: '/orders/returns' },
    { key: 'delivery', label: t('kpi.deliverySuccess'), value: fmt.pct(metrics.deliverySuccessPct), cur: metrics.deliverySuccessPct ?? null, prv: previous?.deliverySuccessPct ?? null, to: '/couriers' },
  ];

  const actions = insights?.actions ?? [];
  const opportunities = insights?.opportunities ?? [];
  const health = insights?.health ?? null;

  const trendData = trend.map((p) => ({
    label: fmt.shortDate(p.date),
    revenue: toChartMoney(p.netRevenue),
    cogs: toChartMoney(p.cogs),
    profit: toChartMoney(p.netProfit),
    contribution: toChartMoney(p.contributionProfit),
    adSpend: toChartMoney(p.adSpend),
    expenses: toChartMoney(p.expenses),
    orders: p.orders,
    cash: toChartMoney(p.cash),
    inventory: toChartMoney(p.inventoryValue),
    margin: p.marginPct === null ? null : Number(p.marginPct.toFixed(1)),
  }));

  const productBars = products
    .filter((p) => p.units > 0)
    .slice(0, 8)
    .map((p) => ({
      id: p.product.id,
      label: p.product.name.length > 18 ? `${p.product.name.slice(0, 17)}…` : p.product.name,
      value: toChartMoney(p.contributionProfit),
    }));

  const categoryBars = (() => {
    const map = new Map<string, Money>();
    for (const p of products) {
      map.set(p.product.category, (map.get(p.product.category) ?? 0) + p.contributionProfit);
    }
    return [...map.entries()]
      .map(([label, value]) => ({ label, value: toChartMoney(value), id: label }))
      .sort((a, b) => b.value - a.value);
  })();

  const courierBars = couriers
    .slice(0, 8)
    .map((c) => ({ id: c.courier.id, label: c.courier.name, value: toChartMoney(c.netContribution) }));

  const channelDonut = (() => {
    const map = new Map<string, number>();
    for (const o of analytics.period.orders) {
      const items = analytics.period.orderItems.filter((i) => i.orderId === o.id);
      const revenue = items.reduce((a, i) => a + i.unitPrice * i.qty, 0);
      map.set(o.channel, (map.get(o.channel) ?? 0) + revenue / 100);
    }
    return [...map.entries()].map(([label, value]) => ({ label, value }));
  })();

  const reasonDonut = (() => {
    const map = new Map<string, number>();
    for (const r of analytics.period.returns) {
      map.set(r.reason, (map.get(r.reason) ?? 0) + 1);
    }
    return [...map.entries()].map(([label, value]) => ({ label, value }));
  })();

  return (
    <>
      <PageHeader
        title={business?.name ? `${t('dashboard.title')}` : t('dashboard.title')}
        subtitle={t('dashboard.subtitle')}
        actions={
          <>
            <Button variant="secondary" onClick={() => setCustomize(true)}>
              {t('dashboard.customize')}
            </Button>
            <Link className="btn btn--primary" to="/orders?new=1">
              {t('orders.new')}
            </Link>
          </>
        }
      >
        <div className="mt-4">
          <PeriodPicker />
        </div>
      </PageHeader>

      {pl.orders === 0 && products.length === 0 && (
        <Card className="mb-5">
          <EmptyState
            icon={<IconSpark size={20} />}
            title={t('empty.products.title')}
            body={t('empty.products.body')}
            action={
              <Button variant="primary" onClick={() => navigate('/products?new=1')}>
                {t('empty.products.cta')}
              </Button>
            }
          />
        </Card>
      )}

      {/* ---- KPI grid ---- */}
      <section className="grid grid--kpi mb-5" aria-label={t('dashboard.title')}>
        {kpis.map((k) => (
          <Metric
            key={k.key}
            label={k.label}
            value={k.value}
            delta={k.cur != null && k.prv != null ? percentChange(k.prv, k.cur) : null}
            hint={
              k.prv != null
                ? `${t('common.previous')}: ${
                    k.key.includes('Margin') || k.key === 'returnRate' || k.key === 'delivery'
                      ? fmt.pct(k.prv)
                      : k.key === 'roas' || k.key === 'mer'
                        ? fmt.multiple(k.prv)
                        : fmt.money(Math.round(k.prv))
                  }`
                : undefined
            }
            title={`${k.label} · ${t('common.vsPrevious')}`}
            onClick={() => navigate(k.to)}
          />
        ))}
      </section>

      {/* ---- Action center ---- */}
      <Card
        title={t('dashboard.attention')}
        subtitle={`${actions.length} ${t('common.actions').toLowerCase()}`}
        className="mb-5"
        actions={
          actions.length > 0 ? (
            <Link className="btn btn--sm btn--secondary" to="/insights">
              {t('insights.actionCenter')} <IconChevronRight size={13} />
            </Link>
          ) : undefined
        }
        flush
      >
        {actions.length === 0 ? (
          <div className="card__body">
            <EmptyState icon={<IconTarget size={20} />} title={t('dashboard.noAttention')} body={t('empty.notifications.body')} />
          </div>
        ) : (
          actions.slice(0, 5).map((a) => (
            <article className="notif" key={a.id}>
              <div className="notif__head">
                <Chip tone={a.priority === 'critical' ? 'danger' : a.priority === 'important' ? 'warning' : a.priority === 'opportunity' ? 'success' : 'info'}>
                  {t(`priority.${a.priority}`)}
                </Chip>
                <span className="notif__title">{a.title}</span>
                {a.metric && <Chip tone="outline">{a.metric}</Chip>}
              </div>
              <p className="notif__body">{a.reason}</p>
              <div className="row gap-3 mt-2" style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-600)' }}>
                <span>
                  <strong>{t('common.impact')}:</strong>{' '}
                  {a.impact !== null ? `${fmt.money(a.impact)} ${a.impactLabel}` : t('insights.opportunity.impactUnknown')}
                </span>
              </div>
              <div className="notif__actions">
                <Button size="sm" variant="secondary" onClick={() => navigate(a.to)}>
                  {a.action}
                </Button>
              </div>
            </article>
          ))
        )}
      </Card>

      {/* ---- Chart tabs ---- */}
      <Card className="mb-5" flush>
        <div className="card__body" style={{ paddingBottom: 0 }}>
          <Tabs
            ariaLabel={t('common.trend')}
            active={tab}
            onChange={setTab}
            items={[
              { id: 'money', label: t('finance.pnl') },
              { id: 'sales', label: t('nav.sales') },
              { id: 'ads', label: t('nav.ads') },
              { id: 'ops', label: t('dashboard.preset.operations') },
            ]}
          />
        </div>
        <div className="card__body">
          {tab === 'money' && (
            <TabPanel id="money">
              <div className="grid grid--2">
                <div>
                  <h4 className="mb-4">{t('chart.revenueTrend')}</h4>
                  <TrendChart
                    data={trendData}
                    lang={fmt.lang}
                    currency={fmt.currency}
                    emptyLabel={t('empty.orders.title')}
                    emptyBody={t('empty.orders.body')}
                    height={260}
                    series={[
                      { key: 'revenue', name: t('kpi.netRevenue'), format: 'money' },
                      { key: 'profit', name: t('kpi.netProfit'), format: 'money', color: 'var(--chart-2)' },
                    ]}
                  />
                </div>
                <div>
                  <h4 className="mb-4">{t('chart.revenueVsCogs')}</h4>
                  <TrendChart
                    data={trendData}
                    lang={fmt.lang}
                    currency={fmt.currency}
                    emptyLabel={t('common.noData')}
                    emptyBody={t('empty.orders.body')}
                    height={260}
                    series={[
                      { key: 'revenue', name: t('kpi.netRevenue'), format: 'money', type: 'area' },
                      { key: 'cogs', name: t('kpi.cogs'), format: 'money', type: 'line', color: 'var(--chart-3)' },
                    ]}
                  />
                </div>
                <div>
                  <h4 className="mb-4">{t('chart.profitTrend')}</h4>
                  <TrendChart
                    data={trendData}
                    lang={fmt.lang}
                    currency={fmt.currency}
                    emptyLabel={t('common.noData')}
                    emptyBody={t('empty.orders.body')}
                    height={240}
                    series={[
                      { key: 'contribution', name: t('kpi.contributionProfit'), format: 'money', type: 'bar' },
                      { key: 'profit', name: t('kpi.netProfit'), format: 'money', type: 'line', color: 'var(--chart-2)' },
                    ]}
                  />
                </div>
                <div>
                  <h4 className="mb-4">{t('chart.cashFlow')}</h4>
                  <KeyValue
                    rows={[
                      { label: t('finance.openingCash'), value: fmt.money(metrics.cash.openingCash) },
                      { label: t('finance.operatingIn'), value: fmt.money(metrics.cash.operatingIn), tone: 'positive' },
                      { label: t('finance.operatingOut'), value: fmt.money(metrics.cash.operatingOut), tone: 'negative' },
                      { label: t('finance.investingOut'), value: fmt.money(metrics.cash.investingOut), tone: 'negative' },
                      { label: t('finance.financingNet'), value: fmt.money(metrics.cash.financingNet) },
                      { label: t('common.change'), value: fmt.money(metrics.cash.netChange), divider: true },
                      { label: t('finance.closingCash'), value: fmt.money(metrics.cash.closingCash), total: true },
                    ]}
                  />
                  <p className="tiny muted mt-4">{t('finance.profitIsNotCash')}</p>
                  <div className="mt-4">
                    <TrendChart
                      data={trendData}
                      lang={fmt.lang}
                      currency={fmt.currency}
                      emptyLabel={t('common.noData')}
                      emptyBody={t('empty.ledger.body')}
                      height={160}
                      denseScroll={false}
                      series={[{ key: 'cash', name: t('kpi.cash'), format: 'money' }]}
                    />
                  </div>
                </div>
              </div>
            </TabPanel>
          )}

          {tab === 'sales' && (
            <TabPanel id="sales">
              <div className="grid grid--2">
                <div>
                  <h4 className="mb-4">{t('chart.ordersTrend')}</h4>
                  <TrendChart
                    data={trendData}
                    lang={fmt.lang}
                    currency={fmt.currency}
                    emptyLabel={t('empty.orders.title')}
                    emptyBody={t('empty.orders.body')}
                    height={240}
                    series={[{ key: 'orders', name: t('kpi.orders'), format: 'number', type: 'bar' }]}
                  />
                </div>
                <div>
                  <h4 className="mb-4">{t('chart.marginTrend')}</h4>
                  <TrendChart
                    data={trendData}
                    lang={fmt.lang}
                    currency={fmt.currency}
                    emptyLabel={t('common.noData')}
                    emptyBody={t('empty.orders.body')}
                    height={240}
                    series={[{ key: 'margin', name: t('kpi.netMargin'), format: 'percent', type: 'line' }]}
                  />
                </div>
                <div>
                  <h4 className="mb-4">{t('chart.productProfitability')}</h4>
                  <HorizontalBarChart data={productBars} lang={fmt.lang} currency={fmt.currency} onSelect={(id) => navigate(`/products/${id}`)} />
                </div>
                <div>
                  <h4 className="mb-4">{t('chart.categoryProfitability')}</h4>
                  <DonutChart data={categoryBars.map((c) => ({ label: c.label, value: Math.max(0, c.value) }))} lang={fmt.lang} currency={fmt.currency} />
                </div>
                <div>
                  <h4 className="mb-4">{t('chart.customerGrowth')}</h4>
                  <KeyValue
                    rows={[
                      { label: t('kpi.newCustomers'), value: fmt.num(metrics.newCustomers) },
                      { label: t('kpi.aov'), value: pl.aov === null ? '—' : fmt.money(Math.round(pl.aov * 100)) },
                      { label: t('customers.repeatRate'), value: fmt.pct(repeatRate(customers)) },
                      { label: t('customers.ltv'), value: fmt.money(totalProfit(customers)) },
                    ]}
                  />
                  <div className="mt-4">
                    <DonutChart data={channelDonut} lang={fmt.lang} currency={fmt.currency} height={200} />
                  </div>
                </div>
                <div>
                  <h4 className="mb-4">{t('chart.returnImpact')}</h4>
                  <KeyValue
                    rows={[
                      { label: t('returns.cashCost'), value: fmt.money(metrics.returns.cashCost), tone: 'negative' },
                      { label: t('returns.recoveredStock'), value: fmt.money(metrics.returns.recoveredStockValue), tone: 'positive' },
                      { label: t('returns.netImpact'), value: fmt.money(metrics.returns.netEconomicImpact), divider: true, total: true },
                      { label: t('kpi.returnRate'), value: fmt.pct(metrics.returnRatePct) },
                    ]}
                  />
                  <div className="mt-4">
                    <DonutChart data={reasonDonut} lang={fmt.lang} currency={fmt.currency} format="number" height={200} />
                  </div>
                </div>
              </div>
            </TabPanel>
          )}

          {tab === 'ads' && (
            <TabPanel id="ads">
              <div className="grid grid--2">
                <div>
                  <h4 className="mb-4">{t('chart.revenueVsAdSpend')}</h4>
                  <TrendChart
                    data={trendData}
                    lang={fmt.lang}
                    currency={fmt.currency}
                    emptyLabel={t('empty.ads.title')}
                    emptyBody={t('empty.ads.body')}
                    height={240}
                    series={[
                      { key: 'revenue', name: t('kpi.netRevenue'), format: 'money', type: 'area' },
                      { key: 'adSpend', name: t('kpi.adSpend'), format: 'money', type: 'line', color: 'var(--chart-3)' },
                    ]}
                  />
                </div>
                <div>
                  <h4 className="mb-4">{t('chart.adPerformance')}</h4>
                  <KeyValue
                    rows={[
                      { label: t('ads.spend'), value: fmt.money(metrics.ad.spend) },
                      { label: t('ads.revenue'), value: fmt.money(metrics.ad.revenue) },
                      { label: t('ads.roas'), value: fmt.multiple(metrics.ad.roas) },
                      { label: t('kpi.breakEvenRoas'), value: fmt.multiple(metrics.breakEvenRoasValue) },
                      { label: t('ads.ctr'), value: fmt.pct(metrics.ad.ctrPct, 2) },
                      { label: t('ads.cpc'), value: metrics.ad.cpc === null ? '—' : fmt.num(metrics.ad.cpc, 2) },
                      { label: t('ads.cvr'), value: fmt.pct(metrics.ad.cvrPct, 2) },
                      { label: t('ads.cpa'), value: metrics.ad.cpa === null ? '—' : fmt.num(metrics.ad.cpa, 2) },
                      { label: t('kpi.contributionProfit'), value: fmt.money(metrics.adProfit.contributionProfit), divider: true, tone: metrics.adProfit.contributionProfit >= 0 ? 'positive' : 'negative' },
                    ]}
                  />
                  {metrics.breakEvenRoasValue === null && metrics.ad.spend > 0 && (
                    <p className="tiny muted mt-4">{t('ads.breakEvenRoasNone')}</p>
                  )}
                </div>
                <div>
                  <h4 className="mb-4">{t('chart.expenseTrend')}</h4>
                  <TrendChart
                    data={trendData}
                    lang={fmt.lang}
                    currency={fmt.currency}
                    emptyLabel={t('empty.expenses.title')}
                    emptyBody={t('empty.expenses.body')}
                    height={220}
                    series={[{ key: 'expenses', name: t('kpi.expenses'), format: 'money', type: 'bar', color: 'var(--chart-6)' }]}
                  />
                </div>
                <div>
                  <h4 className="mb-4">{t('insights.concentration.platform')}</h4>
                  <DonutChart
                    data={(insights?.adPlatformGroups ?? []).map((g) => ({ label: g.key, value: g.totals.spend / 100 }))}
                    lang={fmt.lang}
                    currency={fmt.currency}
                  />
                </div>
              </div>
            </TabPanel>
          )}

          {tab === 'ops' && (
            <TabPanel id="ops">
              <div className="grid grid--2">
                <div>
                  <h4 className="mb-4">{t('chart.courierProfitability')}</h4>
                  <HorizontalBarChart data={courierBars} lang={fmt.lang} currency={fmt.currency} onSelect={() => navigate('/couriers')} />
                  <p className="tiny muted mt-4">{t('couriers.rankNote')}</p>
                </div>
                <div>
                  <h4 className="mb-4">{t('chart.inventoryValue')}</h4>
                  <TrendChart
                    data={trendData}
                    lang={fmt.lang}
                    currency={fmt.currency}
                    emptyLabel={t('empty.inventory.title')}
                    emptyBody={t('empty.inventory.body')}
                    height={220}
                    series={[{ key: 'inventory', name: t('kpi.inventoryValue'), format: 'money', color: 'var(--chart-7)' }]}
                  />
                </div>
                <div>
                  <h4 className="mb-4">{t('widget.deliverySuccess')}</h4>
                  <KeyValue
                    rows={[
                      { label: t('widget.deliverySuccess'), value: fmt.pct(metrics.deliverySuccessPct) },
                      { label: t('kpi.returnRate'), value: fmt.pct(metrics.returnRatePct) },
                      { label: t('kpi.pendingCod'), value: fmt.money(metrics.positions.pendingCod) },
                      { label: t('kpi.pendingSettlement'), value: fmt.money(metrics.positions.pendingSettlement) },
                    ]}
                  />
                </div>
                <div>
                  <h4 className="mb-4">{t('widget.stockoutRisk')}</h4>
                  {inventory.stockoutRisk.length === 0 ? (
                    <p className="muted small">{t('dashboard.noAttention')}</p>
                  ) : (
                    <ul className="stack gap-2">
                      {inventory.stockoutRisk.slice(0, 6).map((r) => (
                        <li key={r.product.id} className="row--between row">
                          <span className="ellipsis">{r.product.name}</span>
                          <span className="num small">
                            {fmt.num(r.available)} · {r.daysLeft === null ? '—' : `${Math.round(r.daysLeft)}${t('common.days')}`}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </TabPanel>
          )}
        </div>
      </Card>

      {/* ---- Widget grid ---- */}
      <h2 className="mb-4">{t('dashboard.presets')}</h2>
      <section className="grid grid--widgets mb-5">
        {visible.map((pref) => (
          <WidgetSlot
            key={pref.id}
            id={pref.id as WidgetId}
            size={pref.size}
            insights={insights}
            onNavigate={navigate}
          />
        ))}
      </section>

      {/* ---- Opportunities ---- */}
      {opportunities.length > 0 && (
        <Card title={t('insights.opportunities')} className="mb-5" flush>
          {opportunities.slice(0, 6).map((o) => (
            <article className="notif" key={o.id}>
              <div className="notif__head">
                <Chip tone="success">{t('priority.opportunity')}</Chip>
                <span className="notif__title">{o.title}</span>
              </div>
              <p className="notif__body">{o.reason}</p>
              <p className="tiny muted">
                <strong>{t('common.impact')}:</strong>{' '}
                {o.impact !== null ? `${fmt.money(o.impact)} ${o.impactLabel}` : t('insights.opportunity.impactUnknown')}
              </p>
              <div className="notif__actions">
                <Button size="sm" variant="secondary" onClick={() => navigate(o.to)}>
                  {o.action}
                </Button>
              </div>
            </article>
          ))}
        </Card>
      )}

      {health && (
        <Card title={t('widget.health')} className="mb-5">
          <div className="row gap-4 mb-4">
            <span className="score__value">{health.score === null ? '—' : health.score}</span>
            <Chip tone={health.band === 'excellent' || health.band === 'good' ? 'success' : health.band === 'fair' ? 'warning' : 'danger'}>
              {t(`ads.health.${health.band === 'excellent' ? 'strong' : health.band === 'good' ? 'healthy' : health.band === 'fair' ? 'watch' : 'weak'}`)}
            </Chip>
            <span className="tiny muted">
              {health.includedCount} / {health.dimensions.length} {t('common.of')} {t('insights.score').toLowerCase()}
            </span>
          </div>
          <div className="grid grid--3">
            {health.dimensions.map((d) => (
              <div key={d.key} className="panel">
                <div className="row--between row mb-2">
                  <strong className="small">{t(`insights.dimension.${d.key}`)}</strong>
                  <span className="num small">{d.score === null ? t('insights.excludedNoData') : `${Math.round(d.score)}`}</span>
                </div>
                {d.score !== null && <Bar value={d.score} tone={d.score >= 66 ? 'success' : d.score >= 40 ? 'warning' : 'danger'} />}
                <p className="tiny muted mt-2">{d.evidence}</p>
                {d.negative && <p className="tiny mt-2" style={{ color: 'var(--danger-700)' }}>{d.negative}</p>}
                {d.positive && <p className="tiny mt-2" style={{ color: 'var(--success-700)' }}>{d.positive}</p>}
                <p className="tiny muted mt-2">{d.recommendation}</p>
              </div>
            ))}
          </div>
        </Card>
      )}

      <CustomizeModal
        open={customize}
        onClose={() => setCustomize(false)}
        prefs={prefs}
        preset={settings.dashboardPreset}
        onApplyPreset={async (p) => {
          if (!settings) return;
          await run(async () => {
            await db.settings.put({ ...settings, dashboardPreset: p, widgets: defaultPrefs(p) });
          });
        }}
        onToggle={async (id, value) => {
          await savePrefs(prefs.map((p) => (p.id === id ? { ...p, visible: value } : p)));
        }}
        onMove={async (id, dir) => {
          const sorted = [...prefs].sort((a, b) => a.order - b.order);
          const idx = sorted.findIndex((p) => p.id === id);
          const swap = idx + dir;
          if (idx < 0 || swap < 0 || swap >= sorted.length) return;
          const a = sorted[idx].order;
          sorted[idx].order = sorted[swap].order;
          sorted[swap].order = a;
          await savePrefs([...sorted]);
        }}
        onRestore={async () => {
          if (!settings) return;
          await run(async () => {
            await db.settings.put({ ...settings, widgets: defaultPrefs(settings.dashboardPreset) });
          });
        }}
      />
    </>
  );
}

/* ------------------------------------------------------------------ *
 * Widget slots
 * ------------------------------------------------------------------ */

function WidgetSlot({
  id,
  size,
  insights,
  onNavigate,
}: {
  id: WidgetId;
  size: 'sm' | 'md' | 'lg';
  insights: ReturnType<typeof useInsights>;
  onNavigate: (to: string) => void;
}) {
  const { t } = useI18n();
  const fmt = useFmt();
  const { analytics } = useWorkspace();
  if (!analytics || !insights) return null;

  const label = t(WIDGET_LABEL[id]);
  const wrap = (body: React.ReactNode, extra?: React.ReactNode) => (
    <Card className={`widget widget--${size}`} title={label} actions={extra} flush>
      <div className="card__body">{body}</div>
    </Card>
  );

  const { metrics, previous, products, inventory, couriers, suppliers, customers, expenses, renewals } = analytics;

  switch (id) {
    case 'health':
      return wrap(
        <div className="stack">
          <div className="row gap-3">
            <span className="score__value">{insights.health.score === null ? '—' : insights.health.score}</span>
            <Chip tone={insights.health.score !== null && insights.health.score >= 65 ? 'success' : 'warning'}>
              {t(`ads.health.${insights.health.band === 'excellent' ? 'strong' : insights.health.band === 'good' ? 'healthy' : insights.health.band === 'fair' ? 'watch' : 'weak'}`)}
            </Chip>
          </div>
          {insights.health.dimensions
            .filter((d) => d.score !== null)
            .slice(0, 5)
            .map((d) => (
              <div key={d.key}>
                <div className="row--between row" style={{ marginBottom: 3 }}>
                  <span className="small">{t(`insights.dimension.${d.key}`)}</span>
                  <span className="num tiny">{Math.round(d.score as number)}</span>
                </div>
                <Bar value={d.score as number} tone={(d.score as number) >= 66 ? 'success' : (d.score as number) >= 40 ? 'warning' : 'danger'} />
              </div>
            ))}
        </div>,
        <Button size="sm" variant="ghost" onClick={() => onNavigate('/insights')}>
          {t('common.viewAll')}
        </Button>,
      );

    case 'profitPulse':
      return wrap(
        <KeyValue
          rows={[
            { label: t('kpi.netRevenue'), value: fmt.money(metrics.pl.netRevenue) },
            { label: t('kpi.grossProfit'), value: fmt.money(metrics.pl.grossProfit) },
            { label: t('kpi.contributionProfit'), value: fmt.money(metrics.pl.contributionProfit) },
            { label: t('kpi.netProfit'), value: fmt.money(metrics.pl.netOperatingProfit), tone: metrics.pl.netOperatingProfit >= 0 ? 'positive' : 'negative', divider: true, total: true },
            { label: t('common.vsPrevious'), value: fmt.delta(percentChange(previous?.pl.netOperatingProfit ?? 0, metrics.pl.netOperatingProfit)) },
          ]}
        />,
      );

    case 'revenueMomentum': {
      const change = percentChange(previous?.pl.netRevenue ?? 0, metrics.pl.netRevenue);
      return wrap(
        <div className="stack">
          <span className="metric__value">{fmt.money(metrics.pl.netRevenue)}</span>
          <div className="row gap-2">
            <span className={`delta delta--${change === null ? 'neutral' : change > 0 ? 'up' : 'down'}`}>{fmt.delta(change)}</span>
            <span className="tiny muted">{t('common.vsPrevious')}</span>
          </div>
          <Sparkline values={analytics.trend.map((p) => p.netRevenue / 100)} width={260} height={44} />
        </div>,
      );
    }

    case 'netMargin':
      return wrap(
        <div className="stack">
          <span className="metric__value">{fmt.pct(metrics.pl.netMarginPct)}</span>
          <Bar value={Math.max(0, Math.min(100, (metrics.pl.netMarginPct ?? 0) * 3))} tone={(metrics.pl.netMarginPct ?? 0) >= 12 ? 'success' : 'warning'} />
          <span className="tiny muted">{t('common.vsPrevious')} {fmt.pct(previous?.pl.netMarginPct ?? null)}</span>
        </div>,
      );

    case 'cashPosition':
      return wrap(
        <KeyValue
          rows={[
            { label: t('kpi.cash'), value: fmt.money(metrics.cash.closingCash), total: true },
            { label: t('finance.operatingIn'), value: fmt.money(metrics.cash.operatingIn), tone: 'positive' },
            { label: t('finance.operatingOut'), value: fmt.money(metrics.cash.operatingOut), tone: 'negative' },
            { label: t('common.change'), value: fmt.money(metrics.cash.netChange), divider: true },
          ]}
        />,
      );

    case 'cashRunway':
      return wrap(
        <div className="stack">
          <span className="metric__value">
            {metrics.cashRunwayDays === null ? '—' : `${Math.round(metrics.cashRunwayDays)} ${t('common.days')}`}
          </span>
          <p className="tiny muted">{t('finance.profitIsNotCash')}</p>
        </div>,
      );

    case 'breakEven': {
      const be = metrics.breakEven;
      return wrap(
        be.breakEvenRevenue === null ? (
          <p className="small muted">{t(`finance.breakEvenUnavailable.${be.unavailableReason ?? 'contribution'}`)}</p>
        ) : (
          <div className="stack">
            <Bar
              value={be.coveragePct ?? 0}
              tone={(be.coveragePct ?? 0) >= 100 ? 'success' : (be.coveragePct ?? 0) >= 70 ? 'warning' : 'danger'}
            />
            <KeyValue
              tight
              rows={[
                { label: t('finance.breakEvenRevenue'), value: fmt.money(be.breakEvenRevenue) },
                { label: t('kpi.revenue'), value: fmt.money(be.currentRevenue) },
                { label: t('finance.coverage'), value: fmt.pct(be.coveragePct) },
                { label: t('finance.revenueGap'), value: fmt.money(be.revenueGap), divider: true },
              ]}
            />
          </div>
        ),
      );
    }

    case 'profitLeak':
      return wrap(
        <KeyValue
          tight
          rows={insights.leaks.slice(0, 6).map((l) => ({
            label: t(`finance.${l.key === 'operating' ? 'operatingExpenses' : l.key === 'cogs' ? 'cogs' : l.key === 'discounts' ? 'discounts' : l.key === 'paymentFees' ? 'paymentFees' : l.key === 'courier' ? 'courier' : l.key === 'packaging' ? 'packaging' : l.key === 'advertising' ? 'advertising' : l.key === 'returns' ? 'returnsCost' : 'damageCost'}`),
            value: fmt.money(l.amount),
            tone: l.severity === 'high' ? ('negative' as const) : undefined,
          }))}
        />,
        <Button size="sm" variant="ghost" onClick={() => onNavigate('/finance/analysis')}>
          {t('common.viewAll')}
        </Button>,
      );

    case 'expenseDrift':
      return wrap(
        expenses.length === 0 ? (
          <p className="small muted">{t('empty.expenses.title')}</p>
        ) : (
          <KeyValue
            tight
            rows={expenses.slice(0, 6).map((e) => ({
              label: e.category,
              value: `${fmt.money(e.current)} ${fmt.delta(e.changePct)}`,
              tone: e.unusual && e.change > 0 ? ('negative' as const) : undefined,
            }))}
          />
        ),
      );

    case 'contributionMargin':
      return wrap(
        <div className="stack">
          <span className="metric__value">{fmt.pct(metrics.pl.contributionMarginPct)}</span>
          <span className="tiny muted">{t('kpi.breakEvenRoas')}: {fmt.multiple(metrics.breakEvenRoasValue)}</span>
        </div>,
      );

    case 'fixedCostRatio':
      return wrap(
        <div className="stack">
          <span className="metric__value">{fmt.pct(fixedRatio(metrics.pl.operatingExpenses, metrics.pl.netRevenue))}</span>
          <span className="tiny muted">{t('kpi.expenses')}: {fmt.money(metrics.pl.operatingExpenses)}</span>
        </div>,
      );

    case 'cashConversion':
      return wrap(
        <div className="stack">
          <span className="metric__value">
            {metrics.pl.netOperatingProfit === 0 ? '—' : fmt.pct(((metrics.cash.operatingIn - metrics.cash.operatingOut) / metrics.pl.netOperatingProfit) * 100)}
          </span>
          <span className="tiny muted">{t('finance.profitIsNotCash')}</span>
        </div>,
      );

    case 'receivables':
      return wrap(
        <KeyValue
          tight
          rows={[
            { label: t('kpi.receivables'), value: fmt.money(metrics.positions.receivables), total: true },
            { label: t('kpi.pendingCod'), value: fmt.money(metrics.positions.pendingCod) },
            { label: t('kpi.pendingSettlement'), value: fmt.money(metrics.positions.pendingSettlement) },
          ]}
        />,
        <Button size="sm" variant="ghost" onClick={() => onNavigate('/finance/receivables')}>
          {t('common.viewAll')}
        </Button>,
      );

    case 'payables':
      return wrap(
        <KeyValue tight rows={[{ label: t('kpi.payables'), value: fmt.money(metrics.positions.payables), total: true }]} />,
        <Button size="sm" variant="ghost" onClick={() => onNavigate('/finance/payables')}>
          {t('common.viewAll')}
        </Button>,
      );

    case 'topProducts':
      return wrap(
        <HorizontalBarChart
          data={products.filter((p) => p.units > 0).slice(0, 6).map((p) => ({ id: p.product.id, label: short(p.product.name), value: p.contributionProfit / 100 }))}
          lang={fmt.lang}
          currency={fmt.currency}
          onSelect={(pid) => onNavigate(`/products/${pid}`)}
        />,
      );

    case 'profitKillers': {
      const killers = products.filter((p) => p.units > 0).sort((a, b) => a.contributionProfit - b.contributionProfit).slice(0, 6);
      return wrap(
        <KeyValue
          tight
          rows={killers.map((p) => ({
            label: short(p.product.name),
            value: fmt.money(p.contributionProfit),
            tone: p.contributionProfit < 0 ? ('negative' as const) : undefined,
          }))}
        />,
      );
    }

    case 'silentWinners': {
      const winners = products
        .filter((p) => p.units > 0 && p.adSpend === 0 && (p.grossMarginPct ?? 0) >= 30)
        .sort((a, b) => b.contributionProfit - a.contributionProfit)
        .slice(0, 6);
      return wrap(
        winners.length === 0 ? (
          <p className="small muted">{t('common.notEnoughData')}</p>
        ) : (
          <KeyValue tight rows={winners.map((p) => ({ label: short(p.product.name), value: fmt.money(p.contributionProfit), tone: 'positive' as const }))} />
        ),
      );
    }

    case 'aov':
      return wrap(
        <div className="stack">
          <span className="metric__value">{metrics.pl.aov === null ? '—' : fmt.money(Math.round(metrics.pl.aov * 100))}</span>
          <span className="tiny muted">{t('common.vsPrevious')} {previous?.pl.aov == null ? '—' : fmt.money(Math.round(previous.pl.aov * 100))}</span>
        </div>,
      );

    case 'orderMomentum':
      return wrap(
        <div className="stack">
          <span className="metric__value">{fmt.num(metrics.pl.orders)}</span>
          <Sparkline values={analytics.trend.map((p) => p.orders)} width={260} height={44} />
          <span className="tiny muted">{t('common.vsPrevious')} {fmt.num(previous?.pl.orders ?? 0)}</span>
        </div>,
      );

    case 'customerGrowth':
      return wrap(
        <KeyValue
          tight
          rows={[
            { label: t('kpi.newCustomers'), value: fmt.num(metrics.newCustomers) },
            { label: t('customers.repeatRate'), value: fmt.pct(repeatRate(customers)) },
            { label: t('customers.segment.vip'), value: fmt.num(customers.filter((c) => c.segment === 'vip').length) },
            { label: t('customers.segment.at-risk'), value: fmt.num(customers.filter((c) => c.segment === 'at-risk' || c.segment === 'win-back').length) },
          ]}
        />,
        <Button size="sm" variant="ghost" onClick={() => onNavigate('/customers')}>
          {t('common.viewAll')}
        </Button>,
      );

    case 'inventoryValue':
      return wrap(
        <div className="stack">
          <span className="metric__value">{fmt.money(inventory.totalValue)}</span>
          <span className="tiny muted">{fmt.num(inventory.totalUnits)} {t('common.units')}</span>
          <span className="tiny muted">{t('inventory.turnover')}: {inventory.averageTurnover === null ? '—' : fmt.num(inventory.averageTurnover, 2)}</span>
        </div>,
      );

    case 'stockoutRisk':
      return wrap(
        inventory.stockoutRisk.length === 0 ? (
          <p className="small muted">{t('dashboard.noAttention')}</p>
        ) : (
          <KeyValue
            tight
            rows={inventory.stockoutRisk.slice(0, 6).map((r) => ({
              label: short(r.product.name),
              value: `${fmt.num(r.available)} ${r.daysLeft !== null ? `· ${Math.round(r.daysLeft)}${t('common.days')}` : ''}`,
              tone: r.state === 'out' ? ('negative' as const) : undefined,
            }))}
          />
        ),
      );

    case 'deadStock':
      return wrap(
        <KeyValue
          tight
          rows={[
            { label: t('inventory.deadStockValue'), value: fmt.money(inventory.deadStockValue), tone: 'negative' },
            ...inventory.deadStock.slice(0, 5).map((r) => ({ label: short(r.product.name), value: fmt.money(r.value) })),
          ]}
        />,
      );

    case 'slowMovers':
      return wrap(
        inventory.slowMovers.length === 0 ? (
          <p className="small muted">{t('common.notEnoughData')}</p>
        ) : (
          <KeyValue tight rows={inventory.slowMovers.slice(0, 6).map((r) => ({ label: short(r.product.name), value: `${fmt.num(r.onHand)} · ${r.daysSinceSale ?? '—'}${t('common.days')}` }))} />
        ),
      );

    case 'fastMovers':
      return wrap(
        inventory.fastMovers.length === 0 ? (
          <p className="small muted">{t('common.notEnoughData')}</p>
        ) : (
          <KeyValue tight rows={inventory.fastMovers.slice(0, 6).map((r) => ({ label: short(r.product.name), value: `${fmt.num(r.unitsSold)} ${t('common.units')}` }))} />
        ),
      );

    case 'reorderRadar':
      return wrap(
        inventory.rows.filter((r) => r.product.reorderLevel > 0 && r.available <= r.product.reorderLevel).length === 0 ? (
          <p className="small muted">{t('dashboard.noAttention')}</p>
        ) : (
          <KeyValue
            tight
            rows={inventory.rows
              .filter((r) => r.product.reorderLevel > 0 && r.available <= r.product.reorderLevel)
              .slice(0, 6)
              .map((r) => ({ label: short(r.product.name), value: `${fmt.num(r.available)} / ${fmt.num(r.product.reorderLevel)}` }))}
          />
        ),
      );

    case 'overstock':
      return wrap(
        <KeyValue
          tight
          rows={[
            { label: t('inventory.overstockValue'), value: fmt.money(inventory.overstockValue) },
            ...inventory.overstock.slice(0, 5).map((r) => ({ label: short(r.product.name), value: fmt.money(r.value) })),
          ]}
        />,
      );

    case 'adHealth': {
      const m = metrics.ad;
      const rows = insights.campaigns.slice(0, 6);
      return wrap(
        metrics.ad.spend === 0 ? (
          <p className="small muted">{t('empty.ads.title')}</p>
        ) : (
          <div className="stack">
            <KeyValue
              tight
              rows={[
                { label: t('ads.spend'), value: fmt.money(m.spend) },
                { label: t('ads.roas'), value: fmt.multiple(m.roas) },
                { label: t('kpi.breakEvenRoas'), value: fmt.multiple(metrics.breakEvenRoasValue) },
              ]}
            />
            <DataTable
              columns={[
                { key: 'name', label: t('ads.campaign'), render: (r: (typeof rows)[number]) => short(r.key), sortValue: (r) => r.key },
                { key: 'roas', label: t('ads.roas'), numeric: true, render: (r) => fmt.multiple(r.roas), sortValue: (r) => r.roas ?? 0 },
                { key: 'd', label: t('ads.health'), render: (r) => <Chip tone={r.decision.decision === 'SCALE' ? 'success' : r.decision.decision === 'PAUSE' ? 'danger' : 'warning'}>{t(`ads.decision.${r.decision.decision}`)}</Chip>, sortValue: (r) => r.decision.decision },
              ]}
              rows={rows}
              rowKey={(r) => r.key}
              pageSize={6}
            />
          </div>
        ),
        <Button size="sm" variant="ghost" onClick={() => onNavigate('/ads')}>
          {t('common.viewAll')}
        </Button>,
      );
    }

    case 'roasTrend':
      return wrap(
        <TrendChart
          data={analytics.trend.map((p) => ({ label: fmt.shortDate(p.date), roas: p.adSpend > 0 ? Number(((p.netRevenue * 0.35) / p.adSpend).toFixed(2)) : 0 }))}
          lang={fmt.lang}
          currency={fmt.currency}
          emptyLabel={t('empty.ads.title')}
          emptyBody={t('empty.ads.body')}
          height={220}
          denseScroll={false}
          series={[{ key: 'roas', name: t('ads.roas'), format: 'multiple', type: 'line' }]}
        />,
      );

    case 'cacTrend':
      return wrap(
        <TrendChart
          data={analytics.trend.map((p) => ({ label: fmt.shortDate(p.date), cac: p.orders > 0 ? Number(((p.adSpend / 100) / p.orders).toFixed(2)) : 0 }))}
          lang={fmt.lang}
          currency={fmt.currency}
          emptyLabel={t('empty.ads.title')}
          emptyBody={t('empty.ads.body')}
          height={220}
          denseScroll={false}
          series={[{ key: 'cac', name: t('kpi.cac'), format: 'money', type: 'line', color: 'var(--chart-3)' }]}
        />,
      );

    case 'cpaTrend':
      return wrap(
        <TrendChart
          data={analytics.trend.map((p) => ({ label: fmt.shortDate(p.date), cpa: p.orders > 0 ? Number(((p.adSpend / 100) / p.orders).toFixed(2)) : 0 }))}
          lang={fmt.lang}
          currency={fmt.currency}
          emptyLabel={t('empty.ads.title')}
          emptyBody={t('empty.ads.body')}
          height={220}
          denseScroll={false}
          series={[{ key: 'cpa', name: t('ads.cpa'), format: 'money', type: 'line', color: 'var(--chart-4)' }]}
        />,
      );

    case 'spendVsRevenue':
      return wrap(
        <TrendChart
          data={analytics.trend.map((p) => ({ label: fmt.shortDate(p.date), spend: p.adSpend / 100, revenue: p.netRevenue / 100 }))}
          lang={fmt.lang}
          currency={fmt.currency}
          emptyLabel={t('empty.ads.title')}
          emptyBody={t('empty.ads.body')}
          height={240}
          series={[
            { key: 'revenue', name: t('kpi.netRevenue'), format: 'money' },
            { key: 'spend', name: t('kpi.adSpend'), format: 'money', type: 'line', color: 'var(--chart-3)' },
          ]}
        />,
      );

    case 'creativeWinners': {
      const creatives = [...insights.adPlatformGroups];
      void creatives;
      const grouped = new Map<string, { spend: number; revenue: number }>();
      for (const row of analytics.period.adRows) {
        const key = row.creative || '—';
        const cur = grouped.get(key) ?? { spend: 0, revenue: 0 };
        cur.spend += row.spend;
        cur.revenue += row.revenue;
        grouped.set(key, cur);
      }
      const list = [...grouped.entries()]
        .map(([label, v]) => ({ id: label, label: short(label), value: (v.revenue - v.spend) / 100 }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 6);
      return wrap(<HorizontalBarChart data={list} lang={fmt.lang} currency={fmt.currency} />);
    }

    case 'productAdProfit': {
      const rows = products
        .filter((p) => p.adSpend > 0)
        .sort((a, b) => b.contributionProfit - a.contributionProfit)
        .slice(0, 8);
      return wrap(
        rows.length === 0 ? (
          <p className="small muted">{t('empty.ads.title')}</p>
        ) : (
          <DataTable
            columns={[
              { key: 'p', label: t('nav.products'), render: (r: (typeof rows)[number]) => short(r.product.name), sortValue: (r) => r.product.name },
              { key: 'spend', label: t('kpi.adSpend'), numeric: true, render: (r) => fmt.money(r.adSpend), sortValue: (r) => r.adSpend },
              { key: 'roas', label: t('ads.roas'), numeric: true, render: (r) => fmt.multiple(r.roas), sortValue: (r) => r.roas ?? 0 },
              { key: 'profit', label: t('common.profit'), numeric: true, render: (r) => fmt.money(r.contributionProfit), sortValue: (r) => r.contributionProfit },
            ]}
            rows={rows}
            rowKey={(r) => r.product.id}
            pageSize={8}
            onRowClick={(r) => onNavigate(`/products/${r.product.id}`)}
          />
        ),
      );
    }

    case 'scalingOpportunities': {
      const scale = insights.campaigns.filter((c) => c.decision.decision === 'SCALE');
      return wrap(
        scale.length === 0 ? (
          <p className="small muted">{t('common.notEnoughData')}</p>
        ) : (
          <KeyValue
            tight
            rows={scale.slice(0, 6).map((c) => ({
              label: short(c.key),
              value: `${fmt.multiple(c.roas)} · +${c.decision.suggestedBudgetChangePct}%`,
              tone: 'positive' as const,
            }))}
          />
        ),
      );
    }

    case 'budgetEfficiency':
      return wrap(
        <KeyValue
          tight
          rows={[
            { label: t('kpi.adSpend'), value: fmt.money(metrics.ad.spend) },
            { label: t('kpi.contributionProfit'), value: fmt.money(metrics.adProfit.contributionProfit), tone: metrics.adProfit.contributionProfit >= 0 ? 'positive' : 'negative' },
            { label: t('ads.cpa'), value: metrics.ad.cpa === null ? '—' : fmt.num(metrics.ad.cpa, 2) },
            { label: t('kpi.cac'), value: metrics.ad.cac === null ? '—' : fmt.num(metrics.ad.cac, 2) },
          ]}
        />,
      );

    case 'courierEfficiency':
      return wrap(
        couriers.length === 0 ? (
          <p className="small muted">{t('empty.couriers.title')}</p>
        ) : (
          <KeyValue
            tight
            rows={couriers.slice(0, 6).map((c) => ({
              label: c.courier.name,
              value: `${fmt.money(c.netContribution)} · ${fmt.pct(c.deliverySuccessPct, 0)}`,
              tone: c.netContribution >= 0 ? ('positive' as const) : ('negative' as const),
            }))}
          />
        ),
      );

    case 'returnHeatmap': {
      const byCourier = couriers.filter((c) => c.returnRatePct !== null);
      return wrap(
        byCourier.length === 0 ? (
          <p className="small muted">{t('empty.returns.title')}</p>
        ) : (
          <div className="stack gap-2">
            {byCourier.slice(0, 6).map((c) => (
              <div key={c.courier.id}>
                <div className="row--between row" style={{ marginBottom: 3 }}>
                  <span className="small">{c.courier.name}</span>
                  <span className="num tiny">{fmt.pct(c.returnRatePct)}</span>
                </div>
                <Bar value={Math.min(100, (c.returnRatePct ?? 0) * 4)} tone={(c.returnRatePct ?? 0) > 15 ? 'danger' : (c.returnRatePct ?? 0) > 8 ? 'warning' : 'success'} />
              </div>
            ))}
          </div>
        ),
      );
    }

    case 'deliverySuccess':
      return wrap(
        <div className="stack">
          <span className="metric__value">{fmt.pct(metrics.deliverySuccessPct)}</span>
          <Bar value={metrics.deliverySuccessPct ?? 0} tone={(metrics.deliverySuccessPct ?? 0) >= 85 ? 'success' : 'warning'} />
          <span className="tiny muted">{t('kpi.pendingCod')}: {fmt.money(metrics.positions.pendingCod)}</span>
        </div>,
      );

    case 'supplierPerformance':
      return wrap(
        suppliers.length === 0 ? (
          <p className="small muted">{t('empty.suppliers.title')}</p>
        ) : (
          <KeyValue tight rows={suppliers.slice(0, 6).map((s) => ({ label: short(s.supplier.name), value: fmt.money(s.purchaseSpend) }))} />
        ),
      );

    case 'renewalRadar': {
      const soon = renewals.filter((r) => r.daysUntilDue <= 30);
      return wrap(
        soon.length === 0 ? (
          <p className="small muted">{t('dashboard.noAttention')}</p>
        ) : (
          <KeyValue
            tight
            rows={soon.slice(0, 6).map((r) => ({
              label: r.item.name,
              value: r.daysUntilDue < 0 ? t('notifications.category.renewals') : `${r.daysUntilDue} ${t('common.days')}`,
              tone: r.daysUntilDue <= 3 ? ('negative' as const) : undefined,
            }))}
          />
        ),
      );
    }

    case 'goals':
      return wrap(
        insights.goals.length === 0 ? (
          <p className="small muted">{t('insights.goal.new')}</p>
        ) : (
          <div className="stack gap-3">
            {insights.goals.slice(0, 5).map((g) => (
              <div key={g.id}>
                <div className="row--between row" style={{ marginBottom: 3 }}>
                  <span className="small">{t(`insights.goal.metric.${g.metric}`)}</span>
                  <span className="num tiny">
                    {g.unit === 'money' ? fmt.money(Math.round(g.actual * 100)) : g.unit === 'percent' ? fmt.pct(g.actual) : g.unit === 'multiple' ? fmt.multiple(g.actual) : fmt.num(g.actual)}
                    {' / '}
                    {g.unit === 'money' ? fmt.money(Math.round(g.target * 100)) : g.unit === 'percent' ? fmt.pct(g.target) : g.unit === 'multiple' ? fmt.multiple(g.target) : fmt.num(g.target)}
                  </span>
                </div>
                <Bar value={g.achievedPct ?? 0} tone={g.onTrack ? 'success' : 'warning'} />
              </div>
            ))}
          </div>
        ),
        <Button size="sm" variant="ghost" onClick={() => onNavigate('/insights/goals')}>
          {t('common.viewAll')}
        </Button>,
      );

    case 'concentrationRisk':
      return wrap(
        <KeyValue
          tight
          rows={insights.concentration.map((c) => ({
            label: t(`insights.concentration.${c.key === 'product' ? 'product' : c.key === 'customer' ? 'customer' : c.key === 'channel' ? 'channel' : c.key === 'supplier' ? 'supplier' : 'platform'}`),
            value: fmt.pct(c.topSharePct),
            tone: c.concentrated ? ('negative' as const) : undefined,
          }))}
        />,
      );

    case 'growthMomentum': {
      const change = percentChange(previous?.pl.netRevenue ?? 0, metrics.pl.netRevenue);
      const orderDelta = absoluteChange(previous?.pl.orders ?? 0, metrics.pl.orders);
      return wrap(
        <div className="stack">
          <span className={`delta delta--${change === null ? 'neutral' : change > 0 ? 'up' : 'down'}`} style={{ width: 'fit-content' }}>
            {fmt.delta(change)}
          </span>
          <span className="tiny muted">
            {t('kpi.orders')}: {orderDelta >= 0 ? '+' : ''}
            {fmt.num(orderDelta)}
          </span>
          <span className="tiny muted">{t('kpi.newCustomers')}: {fmt.num(metrics.newCustomers)}</span>
        </div>,
      );
    }

    case 'whatIf':
      return wrap(
        <div className="stack">
          <p className="small">{t('insights.scenario.disclaimer')}</p>
          <Button variant="secondary" size="sm" onClick={() => onNavigate('/insights/what-if')}>
            {t('insights.whatIf')}
          </Button>
        </div>,
      );

    case 'forecast': {
      const f = insights.forecast?.revenue;
      return wrap(
        !f || !f.sufficient ? (
          <p className="small muted">{t('insights.forecast.notEnough')}</p>
        ) : (
          <div className="stack">
            <TrendChart
              data={[
                ...analytics.trend.slice(-14).map((p) => ({ label: fmt.shortDate(p.date), actual: p.netRevenue / 100, predicted: null as number | null })),
                ...f.points.map((p) => ({ label: fmt.shortDate(p.date), actual: null as number | null, predicted: p.value })),
              ]}
              lang={fmt.lang}
              currency={fmt.currency}
              emptyLabel={t('insights.forecast.notEnough')}
              emptyBody={t('insights.forecast.notEnough')}
              height={220}
              series={[
                { key: 'actual', name: t('common.actual'), format: 'money', type: 'line' },
                { key: 'predicted', name: t('common.forecast'), format: 'money', type: 'line', color: 'var(--chart-2)' },
              ]}
            />
            <p className="tiny muted">
              {t('insights.forecast.history')}: {f.historyUsed} · {t('common.confidence')}: {f.confidence}%
            </p>
            <p className="tiny muted">{t('insights.forecast.disclaimer')}</p>
          </div>
        ),
        <Button size="sm" variant="ghost" onClick={() => onNavigate('/insights/forecast')}>
          {t('common.viewAll')}
        </Button>,
      );
    }

    default:
      return null;
  }
}

/* ------------------------------------------------------------------ *
 * Customize modal
 * ------------------------------------------------------------------ */

function CustomizeModal({
  open,
  onClose,
  prefs,
  preset,
  onApplyPreset,
  onToggle,
  onMove,
  onRestore,
}: {
  open: boolean;
  onClose: () => void;
  prefs: WidgetPref[];
  preset: WidgetPreset;
  onApplyPreset: (p: WidgetPreset) => Promise<void>;
  onToggle: (id: string, value: boolean) => Promise<void>;
  onMove: (id: string, dir: -1 | 1) => Promise<void>;
  onRestore: () => Promise<void>;
}) {
  const { t } = useI18n();
  const sorted = [...prefs].sort((a, b) => a.order - b.order);
  const presets: WidgetPreset[] = ['executive', 'finance', 'sales', 'ads', 'operations', 'minimal'];

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('dashboard.customize')}
      size="lg"
      footer={
        <>
          <Button onClick={onRestore}>{t('action.restoreDefaults')}</Button>
          <Button variant="primary" onClick={onClose}>
            {t('common.done')}
          </Button>
        </>
      }
    >
      <div className="stack">
        <div>
          <h4 className="mb-4">{t('dashboard.presets')}</h4>
          <div className="row gap-2">
            {presets.map((p) => (
              <Button key={p} size="sm" variant={preset === p ? 'primary' : 'secondary'} onClick={() => onApplyPreset(p)}>
                {t(`dashboard.preset.${p}`)}
              </Button>
            ))}
          </div>
        </div>
        <hr className="divider" />
        <div>
          {sorted.map((pref, index) => (
            <div key={pref.id} className="row--between row" style={{ padding: 'var(--space-2) 0', borderBottom: '1px solid var(--line-subtle)' }}>
              <Switch label={t(WIDGET_LABEL[pref.id as WidgetId])} checked={pref.visible} onChange={(v) => onToggle(pref.id, v)} />
              <div className="row gap-2">
                <Button size="sm" variant="ghost" disabled={index === 0} onClick={() => onMove(pref.id, -1)} aria-label="Move up">
                  ↑
                </Button>
                <Button size="sm" variant="ghost" disabled={index === sorted.length - 1} onClick={() => onMove(pref.id, 1)} aria-label="Move down">
                  ↓
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ *
 * helpers
 * ------------------------------------------------------------------ */

function short(value: string, max = 22): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function repeatRate(customers: { orders: number }[]): number | null {
  if (customers.length === 0) return null;
  return (customers.filter((c) => c.orders > 1).length / customers.length) * 100;
}

function totalProfit(customers: { profit: Money }[]): Money {
  return customers.reduce((a, c) => a + c.profit, 0);
}

function fixedRatio(opex: Money, netRevenue: Money): number | null {
  if (netRevenue <= 0) return null;
  return (opex / netRevenue) * 100;
}

export const DASHBOARD_ICON = IconBell;
export type { Series };
