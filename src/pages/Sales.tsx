import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '../i18n';
import { useWorkspace } from '../state/workspace';
import { useFmt } from '../state/format';
import { useInsights } from '../state/insights';
import { PageHeader } from '../components/layout/PageHeader';
import { PeriodPicker } from '../components/layout/PeriodPicker';
import { Bar, Card, Chip, EmptyState, KeyValue, Metric, SelectInput } from '../components/ui/primitives';
import { DataTable, type Column } from '../components/ui/DataTable';
import { DonutChart, HorizontalBarChart, TrendChart, toChartMoney } from '../components/charts/Charts';
import { percentChange } from '../lib/money';

type Dim = 'channel' | 'customer' | 'product' | 'courier' | 'category';

interface DimRow {
  id: string;
  label: string;
  revenue: number;
  orders: number;
  contribution: number;
  discount: number;
  margin: number | null;
}

export function SalesPage() {
  const { t } = useI18n();
  const fmt = useFmt();
  const { analytics, loading } = useWorkspace();
  const insights = useInsights();
  const forecast = insights?.forecast?.revenue ?? null;
  const [dim, setDim] = useState<Dim>('channel');

  if (loading || !analytics) return <Card><p className="muted small">{t('common.loading')}</p></Card>;

  const { pl, positions, returnRatePct, deliverySuccessPct } = analytics.metrics;
  const prev = analytics.previous;
  const trend = analytics.trend;
  const customers = analytics.customers;

  const channelRows = (() => {
    const map = new Map<string, DimRow>();
    for (const o of analytics.period.orders) {
      const eco = analytics.metrics.orderEconomicsByOrder.get(o.id);
      const key = o.channel || '—';
      const cur = map.get(key) ?? { id: key, label: key, revenue: 0, orders: 0, contribution: 0, discount: 0, margin: null };
      cur.revenue += eco?.netRevenue ?? 0;
      cur.orders += 1;
      cur.contribution += eco?.contributionProfit ?? 0;
      cur.discount += eco?.discounts ?? 0;
      map.set(key, cur);
    }
    return withMargin([...map.values()]);
  })();

  const categoryRows = (() => {
    const map = new Map<string, DimRow>();
    for (const p of analytics.products) {
      const key = p.product.category || '—';
      const cur = map.get(key) ?? { id: key, label: key, revenue: 0, orders: 0, contribution: 0, discount: 0, margin: null };
      cur.revenue += p.netRevenue;
      cur.orders += p.units;
      cur.contribution += p.contributionProfit;
      cur.discount += p.discounts;
      map.set(key, cur);
    }
    return withMargin([...map.values()]);
  })();

  const productRows = withMargin(
    analytics.products.map((p) => ({
      id: p.product.id,
      label: p.product.name,
      revenue: p.netRevenue,
      orders: p.units,
      contribution: p.contributionProfit,
      discount: p.discounts,
      margin: p.netMarginPct,
    })),
  );

  const courierRows = withMargin(
    analytics.couriers.map((c) => ({
      id: c.courier.id,
      label: c.courier.name,
      revenue: c.revenue,
      orders: c.orders,
      contribution: c.netContribution,
      discount: c.totalFees,
      margin: null,
    })),
  );

  const customerRows = withMargin(
    customers.map((c) => ({
      id: c.customer.id,
      label: c.customer.name,
      revenue: c.revenue,
      orders: c.orders,
      contribution: c.profit,
      discount: 0,
      margin: null,
    })),
  );

  const dimensionRows =
    dim === 'channel' ? channelRows : dim === 'category' ? categoryRows : dim === 'product' ? productRows : dim === 'courier' ? courierRows : customerRows;

  const topDonut = dimensionRows.slice(0, 6).map((r) => ({ label: r.label, value: toChartMoney(r.revenue) }));
  const bars = dimensionRows.slice(0, 10).map((r) => ({ id: r.id, label: clip(r.label), value: toChartMoney(r.contribution) }));

  const bestDay = trend.reduce((a, b) => (b.netRevenue > a.netRevenue ? b : a), trend[0]);
  const forecastPoint = forecast?.points.at(-1);
  const repeat = customers.filter((c) => c.orders > 1).length;
  const repeatPct = customers.length > 0 ? (repeat / customers.length) * 100 : null;
  const itemsPerOrder = pl.orders > 0 ? pl.units / pl.orders : null;

  const columns: Column<DimRow>[] = [
    {
      key: 'label',
      label: t('common.name'),
      render: (r) =>
        dim === 'product' ? <Link to={`/products/${r.id}`}>{r.label}</Link> : dim === 'customer' ? <Link to={`/customers/${r.id}`}>{r.label}</Link> : r.label,
      sortValue: (r) => r.label,
    },
    { key: 'revenue', label: t('finance.netRevenue'), numeric: true, render: (r) => fmt.money(r.revenue), sortValue: (r) => r.revenue },
    { key: 'orders', label: dim === 'product' || dim === 'category' ? t('common.units') : t('kpi.orders'), numeric: true, render: (r) => fmt.num(r.orders), sortValue: (r) => r.orders },
    {
      key: 'contribution',
      label: t('kpi.contributionProfit'),
      numeric: true,
      render: (r) => <span style={{ color: r.contribution < 0 ? 'var(--fin-loss)' : 'var(--fin-profit)' }}>{fmt.money(r.contribution)}</span>,
      sortValue: (r) => r.contribution,
    },
    { key: 'margin', label: t('kpi.contributionMargin'), numeric: true, render: (r) => fmt.pct(r.margin), sortValue: (r) => r.margin },
    { key: 'discount', label: dim === 'courier' ? t('finance.courier') : t('finance.discounts'), numeric: true, render: (r) => fmt.money(r.discount), sortValue: (r) => r.discount, hideOnMobile: true },
    {
      key: 'bar',
      label: t('common.trend'),
      render: (r) => <Bar value={Math.max(0, Math.min(100, r.margin ?? 0))} tone={(r.margin ?? 0) >= 20 ? 'success' : (r.margin ?? 0) >= 0 ? 'warning' : 'danger'} />,
      sortValue: (r) => r.margin,
      width: '110px',
      hideOnMobile: true,
    },
  ];

  return (
    <>
      <PageHeader title={t('sales.title')} subtitle={t('sales.subtitle')}>
        <div className="mt-4">
          <PeriodPicker />
        </div>
      </PageHeader>

      <div className="grid grid--kpi mb-5">
        <Metric label={t('kpi.netRevenue')} value={fmt.money(pl.netRevenue)} delta={percentChange(prev?.pl.netRevenue ?? 0, pl.netRevenue)} />
        <Metric label={t('kpi.orders')} value={fmt.num(pl.orders)} delta={percentChange(prev?.pl.orders ?? 0, pl.orders)} />
        <Metric label={t('kpi.aov')} value={pl.aov === null ? t('common.noData') : fmt.money(Math.round(pl.aov * 100))} delta={percentChange(prev?.pl.aov ?? 0, pl.aov ?? 0)} />
        <Metric label={t('kpi.itemsPerOrder')} value={fmt.num(itemsPerOrder, 2)} />
        <Metric label={t('kpi.grossProfit')} value={fmt.money(pl.grossProfit)} tone={pl.grossProfit >= 0 ? 'positive' : 'negative'} />
        <Metric label={t('kpi.contributionProfit')} value={fmt.money(pl.contributionProfit)} tone={pl.contributionProfit >= 0 ? 'positive' : 'negative'} delta={percentChange(prev?.pl.contributionProfit ?? 0, pl.contributionProfit)} />
        <Metric label={t('kpi.netProfit')} value={fmt.money(pl.netOperatingProfit)} tone={pl.netOperatingProfit >= 0 ? 'positive' : 'negative'} />
        <Metric label={t('kpi.discountRate')} value={fmt.pct(pl.netRevenue > 0 ? (pl.discounts / pl.netRevenue) * 100 : null)} hint={fmt.money(pl.discounts)} />
        <Metric label={t('kpi.deliverySuccessRate')} value={fmt.pct(deliverySuccessPct)} />
        <Metric label={t('kpi.returnRate')} value={fmt.pct(returnRatePct)} />
        <Metric label={t('kpi.repeatRate')} value={fmt.pct(repeatPct)} />
        <Metric label={t('kpi.pendingCod')} value={fmt.money(positions.pendingCod)} hint={t('finance.profitIsNotCash')} />
      </div>

      <Card title={t('sales.revenueTrend')} className="mb-5">
        {trend.length === 0 ? (
          <EmptyState title={t('sales.empty.title')} body={t('sales.empty.body')} />
        ) : (
          <>
            <TrendChart
              data={trend.map((p) => ({
                label: fmt.shortDate(p.date),
                revenue: toChartMoney(p.netRevenue),
                profit: toChartMoney(p.contributionProfit),
                ads: toChartMoney(p.adSpend),
              }))}
              series={[
                { key: 'revenue', name: t('finance.netRevenue'), format: 'money' },
                { key: 'profit', name: t('kpi.contributionProfit'), format: 'money', color: 'var(--chart-3)' },
                { key: 'ads', name: t('kpi.adSpend'), format: 'money', color: 'var(--chart-5)' },
              ]}
              lang={fmt.lang}
              currency={fmt.currency}
              height={300}
              emptyLabel={t('sales.empty.title')}
              emptyBody={t('sales.empty.body')}
            />
            <div className="row gap-4 mt-4">
              {bestDay && (
                <Chip tone="info">
                  {t('sales.bestDay')}: {fmt.shortDate(bestDay.date)} · {fmt.money(bestDay.netRevenue)}
                </Chip>
              )}
              <Chip tone="outline">
                {t('insights.forecast.title')}: {forecastPoint && forecast?.sufficient ? `${fmt.money(Math.round(forecastPoint.value * 100))} · ${fmt.pct(forecast.confidence)}` : t('common.notEnoughData')}
              </Chip>
            </div>
          </>
        )}
      </Card>

      <Card title={t('sales.byDimension')} className="mb-5" flush>
        <div className="card__body">
          <div className="mb-4" style={{ maxWidth: 260 }}>
            <SelectInput
              aria-label={t('sales.byDimension')}
              value={dim}
              onChange={(e) => setDim(e.target.value as Dim)}
              options={[
                { value: 'channel', label: t('sales.byChannel') },
                { value: 'category', label: t('sales.byCategory') },
                { value: 'product', label: t('sales.byProduct') },
                { value: 'customer', label: t('sales.byCustomer') },
                { value: 'courier', label: t('sales.byCourier') },
              ]}
            />
          </div>
          {dimensionRows.length > 0 && (
            <div className="grid grid--2 mb-5">
              <div>
                <h4 className="mb-4">{t('finance.netRevenue')}</h4>
                <DonutChart data={topDonut} lang={fmt.lang} currency={fmt.currency} height={220} />
              </div>
              <div>
                <h4 className="mb-4">{t('kpi.contributionProfit')}</h4>
                <HorizontalBarChart data={bars} lang={fmt.lang} currency={fmt.currency} />
              </div>
            </div>
          )}
        </div>
        <DataTable
          columns={columns}
          rows={dimensionRows}
          rowKey={(r) => r.id}
          empty={<EmptyState title={t('sales.empty.title')} body={t('sales.empty.body')} />}
        />
      </Card>

      <div className="grid grid--2">
        <Card title={t('sales.funnel')}>
          <KeyValue
            rows={[
              { label: t('kpi.orders'), value: fmt.num(pl.orders) },
              { label: t('kpi.unitsSold'), value: fmt.num(pl.units) },
              { label: t('kpi.itemsPerOrder'), value: fmt.num(itemsPerOrder, 2) },
              { label: t('kpi.aov'), value: pl.aov === null ? '—' : fmt.money(Math.round(pl.aov * 100)) },
              { label: t('sales.deliverySuccess'), value: fmt.pct(deliverySuccessPct), divider: true },
              { label: t('kpi.returnRate'), value: fmt.pct(returnRatePct) },
              { label: t('kpi.repeatRate'), value: fmt.pct(repeatPct) },
              { label: t('kpi.newCustomers'), value: fmt.num(analytics.metrics.newCustomers) },
            ]}
          />
        </Card>
        <Card title={t('sales.channelShare')}>
          {channelRows.length === 0 ? (
            <EmptyState title={t('sales.empty.title')} body={t('sales.empty.body')} />
          ) : (
            <KeyValue
              rows={channelRows.slice(0, 8).map((r) => ({
                label: r.label,
                value: `${fmt.money(r.revenue)} · ${fmt.num(r.orders)}`,
                tone: r.contribution < 0 ? ('negative' as const) : undefined,
              }))}
            />
          )}
        </Card>
      </div>
    </>
  );
}

function withMargin(rows: DimRow[]): DimRow[] {
  return rows
    .map((r) => ({ ...r, margin: r.revenue > 0 ? (r.contribution / r.revenue) * 100 : null }))
    .sort((a, b) => b.revenue - a.revenue);
}

function clip(label: string): string {
  return label.length > 20 ? `${label.slice(0, 19)}…` : label;
}
