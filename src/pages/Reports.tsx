import { useState } from 'react';
import { useI18n } from '../i18n';
import { useWorkspace } from '../state/workspace';
import { useFmt } from '../state/format';
import { PageHeader } from '../components/layout/PageHeader';
import { PeriodPicker } from '../components/layout/PeriodPicker';
import { Button, Card, Chip, EmptyState, KeyValue, SelectInput } from '../components/ui/primitives';
import { downloadText, toCSV } from '../lib/csv';
import { toMajor } from '../lib/money';
import { IconDownload } from '../components/ui/icons';

type ReportId = 'pnl' | 'cashflow' | 'orders' | 'products' | 'inventory' | 'customers' | 'suppliers' | 'couriers' | 'expenses' | 'ads' | 'ledger' | 'returns';

export function ReportsPage() {
  const { t } = useI18n();
  const fmt = useFmt();
  const { analytics, data, loading, range } = useWorkspace();
  const [selected, setSelected] = useState<ReportId>('pnl');

  if (loading || !analytics || !data) return <Card><p className="muted small">{t('common.loading')}</p></Card>;

  const { pl, cash, positions } = analytics.metrics;
  const stamp = `${range.start}_${range.end}`;

  const reports: { id: ReportId; label: string; rows: number; headers: string[]; rowsForCsv: (string | number | null)[][] }[] = [
    {
      id: 'pnl',
      label: t('reports.pnl'),
      rows: 16,
      headers: ['Line', 'Amount'],
      rowsForCsv: [
        ['Gross revenue', toMajor(pl.grossRevenue)],
        ['Discounts', -toMajor(pl.discounts)],
        ['Shipping income', toMajor(pl.shippingIncome)],
        ['Net revenue', toMajor(pl.netRevenue)],
        ['COGS', -toMajor(pl.cogs)],
        ['Gross profit', toMajor(pl.grossProfit)],
        ['Advertising', -toMajor(pl.variable.advertising)],
        ['Courier', -toMajor(pl.variable.courier)],
        ['Packaging', -toMajor(pl.variable.packaging)],
        ['Payment fees', -toMajor(pl.variable.paymentFees)],
        ['Returns', -toMajor(pl.variable.returns)],
        ['Damage', -toMajor(pl.variable.damage)],
        ['Other variable', -toMajor(pl.variable.otherVariable)],
        ['Contribution profit', toMajor(pl.contributionProfit)],
        ['Operating expenses', -toMajor(pl.operatingExpenses)],
        ['Net operating profit', toMajor(pl.netOperatingProfit)],
      ],
    },
    {
      id: 'cashflow',
      label: t('reports.cashFlow'),
      rows: cash.lines.length,
      headers: ['Group', 'Line', 'Direction', 'Amount'],
      rowsForCsv: cash.lines.map((l) => [l.group, l.label, l.direction, toMajor(l.amount)]),
    },
    {
      id: 'orders',
      label: t('reports.orders'),
      rows: analytics.period.orders.length,
      headers: ['Order', 'Date', 'Customer', 'Channel', 'Status', 'Net revenue', 'COGS', 'Contribution profit', 'Net profit'],
      rowsForCsv: analytics.period.orders.map((o) => {
        const eco = analytics.metrics.orderEconomicsByOrder.get(o.id);
        return [
          o.orderNo,
          o.date,
          data.customers.find((c) => c.id === o.customerId)?.name ?? '',
          o.channel,
          o.status,
          toMajor(eco?.netRevenue ?? 0),
          toMajor(eco?.cogs ?? 0),
          toMajor(eco?.contributionProfit ?? 0),
          toMajor(eco?.netProfit ?? 0),
        ];
      }),
    },
    {
      id: 'products',
      label: t('reports.products'),
      rows: analytics.products.length,
      headers: ['SKU', 'Name', 'Category', 'Units', 'Net revenue', 'True unit cost', 'COGS', 'Gross profit', 'Contribution profit', 'Margin %', 'Stock'],
      rowsForCsv: analytics.products.map((p) => [
        p.product.sku,
        p.product.name,
        p.product.category,
        p.units,
        toMajor(p.netRevenue),
        toMajor(p.trueUnitCost),
        toMajor(p.cogs),
        toMajor(p.grossProfit),
        toMajor(p.contributionProfit),
        p.netMarginPct === null ? '' : Number(p.netMarginPct.toFixed(2)),
        p.stock,
      ]),
    },
    {
      id: 'inventory',
      label: t('reports.inventory'),
      rows: analytics.inventory.rows.length,
      headers: ['SKU', 'Name', 'On hand', 'Reserved', 'Available', 'Unit cost', 'Value', 'Units sold', 'Turnover', 'Days left', 'State'],
      rowsForCsv: analytics.inventory.rows.map((r) => [
        r.product.sku,
        r.product.name,
        r.onHand,
        r.reserved,
        r.available,
        toMajor(r.unitCost),
        toMajor(r.value),
        r.unitsSold,
        r.turnover === null ? '' : Number(r.turnover.toFixed(3)),
        r.daysLeft === null ? '' : Math.round(r.daysLeft),
        r.state,
      ]),
    },
    {
      id: 'customers',
      label: t('reports.customers'),
      rows: analytics.customers.length,
      headers: ['Name', 'Phone', 'City', 'Orders', 'Net revenue', 'Profit', 'LTV', 'Return rate %', 'Last order', 'Segment'],
      rowsForCsv: analytics.customers.map((c) => [
        c.customer.name,
        c.customer.phone,
        c.customer.city,
        c.orders,
        toMajor(c.revenue),
        toMajor(c.profit),
        toMajor(c.ltv),
        c.returnRatePct === null ? '' : Number(c.returnRatePct.toFixed(2)),
        c.lastOrderDate ?? '',
        c.segment,
      ]),
    },
    {
      id: 'suppliers',
      label: t('reports.suppliers'),
      rows: analytics.suppliers.length,
      headers: ['Name', 'Purchases', 'Spend', 'Avg unit cost', 'Lead time days', 'On-time %', 'Outstanding', 'Share %'],
      rowsForCsv: analytics.suppliers.map((s) => [
        s.supplier.name,
        s.orders,
        toMajor(s.purchaseSpend),
        s.averageUnitCost === null ? '' : toMajor(s.averageUnitCost),
        s.leadTimeDays === null ? '' : Number(s.leadTimeDays.toFixed(1)),
        s.onTimeRatePct === null ? '' : Number(s.onTimeRatePct.toFixed(1)),
        toMajor(s.outstanding),
        s.sharePct === null ? '' : Number(s.sharePct.toFixed(2)),
      ]),
    },
    {
      id: 'couriers',
      label: t('reports.couriers'),
      rows: analytics.couriers.length,
      headers: ['Name', 'Orders', 'Delivered', 'Failed', 'Success %', 'Fees', 'Failed cost', 'Return cost', 'Net contribution', 'COD outstanding'],
      rowsForCsv: analytics.couriers.map((c) => [
        c.courier.name,
        c.orders,
        c.delivered,
        c.failed,
        c.deliverySuccessPct === null ? '' : Number(c.deliverySuccessPct.toFixed(2)),
        toMajor(c.totalFees),
        toMajor(c.failedDeliveryCost),
        toMajor(c.returnCost),
        toMajor(c.netContribution),
        toMajor(c.codOutstanding),
      ]),
    },
    {
      id: 'expenses',
      label: t('reports.expenses'),
      rows: data.expenses.filter((e) => e.date >= range.start && e.date <= range.end).length,
      headers: ['Date', 'Category', 'Vendor', 'Method', 'Amount', 'Note'],
      rowsForCsv: data.expenses
        .filter((e) => e.date >= range.start && e.date <= range.end)
        .map((e) => [e.date, e.category, e.vendor, e.method, toMajor(e.amount), e.note]),
    },
    {
      id: 'ads',
      label: t('reports.ads'),
      rows: analytics.period.adRows.length,
      headers: ['Date', 'Platform', 'Campaign', 'Ad', 'Spend', 'Revenue', 'Impressions', 'Clicks', 'Purchases', 'ROAS'],
      rowsForCsv: analytics.period.adRows.map((r) => [
        r.date,
        r.platform,
        r.campaign,
        r.ad,
        toMajor(r.spend),
        toMajor(r.revenue),
        r.impressions,
        r.clicks,
        r.purchases,
        r.spend > 0 ? Number((r.revenue / r.spend).toFixed(3)) : '',
      ]),
    },
    {
      id: 'ledger',
      label: t('reports.ledger'),
      rows: data.ledger.filter((e) => e.date >= range.start && e.date <= range.end).length,
      headers: ['Date', 'Category', 'Label', 'Direction', 'Amount', 'Source'],
      rowsForCsv: data.ledger
        .filter((e) => e.date >= range.start && e.date <= range.end)
        .map((e) => [e.date, e.category, e.label, e.direction, toMajor(e.amount), e.refType]),
    },
    {
      id: 'returns',
      label: t('reports.returns'),
      rows: analytics.period.returns.length,
      headers: ['Date', 'Order', 'SKU', 'Qty', 'Reason', 'Return fee', 'Refund', 'Condition', 'Resellable'],
      rowsForCsv: analytics.period.returns.map((r) => [
        r.date,
        data.orders.find((o) => o.id === r.orderId)?.orderNo ?? '',
        data.products.find((p) => p.id === r.productId)?.sku ?? '',
        r.qty,
        r.reason,
        toMajor(r.returnFee),
        toMajor(r.refund),
        r.condition,
        r.resellable ? 'yes' : 'no',
      ]),
    },
  ];

  const current = reports.find((r) => r.id === selected) ?? reports[0];

  const exportCsv = () => {
    const csv = toCSV(current.headers, current.rowsForCsv);
    downloadText(`selleros-${current.id}-${stamp}.csv`, csv);
  };

  return (
    <>
      <PageHeader title={t('reports.title')} subtitle={t('reports.subtitle')}>
        <div className="mt-4">
          <PeriodPicker />
        </div>
      </PageHeader>

      <Card className="mb-5">
        <div className="row gap-3">
          <div style={{ minWidth: 240 }}>
            <SelectInput
              label={t('reports.report')}
              value={selected}
              onChange={(e) => setSelected(e.target.value as ReportId)}
              options={reports.map((r) => ({ value: r.id, label: r.label }))}
            />
          </div>
          <div className="row gap-2" style={{ alignItems: 'flex-end' }}>
            <Button variant="primary" icon={<IconDownload size={15} />} onClick={exportCsv} disabled={current.rows === 0}>
              {t('action.export')}
            </Button>
          </div>
        </div>
        <p className="field__help mt-4">{t('reports.explain')}</p>
      </Card>

      <div className="grid grid--2 mb-5">
        <Card title={t('reports.preview')}>
          {current.rows === 0 ? (
            <EmptyState title={t('common.noData')} body={t('empty.table')} />
          ) : (
            <div className="table-wrap" style={{ maxHeight: 420 }}>
              <table className="table">
                <thead>
                  <tr>
                    {current.headers.map((h) => (
                      <th key={h} scope="col">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {current.rowsForCsv.slice(0, 25).map((row, i) => (
                    <tr key={i}>
                      {row.map((cell, j) => (
                        <td key={j} className={typeof cell === 'number' ? 'num' : undefined}>
                          {cell === null || cell === '' ? '—' : String(cell)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {current.rows > 25 && <p className="tiny muted mt-4">{t('reports.previewMore', { count: fmt.num(current.rows) })}</p>}
        </Card>

        <Card title={t('reports.summary')}>
          <KeyValue
            rows={[
              { label: t('finance.netRevenue'), value: fmt.money(pl.netRevenue) },
              { label: t('kpi.contributionProfit'), value: fmt.money(pl.contributionProfit), tone: pl.contributionProfit >= 0 ? 'positive' : 'negative' },
              { label: t('kpi.netProfit'), value: fmt.money(pl.netOperatingProfit), tone: pl.netOperatingProfit >= 0 ? 'positive' : 'negative' },
              { label: t('kpi.cashBalance'), value: fmt.money(cash.closingCash), divider: true },
              { label: t('kpi.receivables'), value: fmt.money(positions.receivables) },
              { label: t('kpi.payables'), value: fmt.money(positions.payables) },
              { label: t('kpi.inventoryValue'), value: fmt.money(positions.inventoryValue) },
              { label: t('kpi.pendingCod'), value: fmt.money(positions.pendingCod), divider: true },
              { label: t('reports.rows'), value: fmt.num(current.rows) },
              { label: t('common.period'), value: `${fmt.shortDate(range.start)} – ${fmt.shortDate(range.end)}` },
            ]}
          />
          <div className="row gap-2 mt-4">
            <Chip tone="outline">{fmt.num(analytics.range.days)} {t('common.days')}</Chip>
            <Chip tone="outline">{fmt.num(analytics.period.orders.length)} {t('kpi.orders').toLowerCase()}</Chip>
            <Chip tone="outline">{fmt.num(analytics.period.adRows.length)} {t('ads.rows').toLowerCase()}</Chip>
          </div>
        </Card>
      </div>
    </>
  );
}
