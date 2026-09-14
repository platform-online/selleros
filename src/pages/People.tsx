import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useI18n } from '../i18n';
import { useWorkspace } from '../state/workspace';
import { useFmt } from '../state/format';
import { PageHeader } from '../components/layout/PageHeader';
import { PeriodPicker } from '../components/layout/PeriodPicker';
import { Bar, Button, Card, Chip, EmptyState, KeyValue, Modal, Switch, TextInput, useToast } from '../components/ui/primitives';
import { DataTable, type Column } from '../components/ui/DataTable';
import { DonutChart, HorizontalBarChart } from '../components/charts/Charts';
import type { CustomerRow, CourierRow, SupplierRow } from '../domain/context';
import { emptyCourier, emptyCustomer, emptySupplier, saveCourier, saveCustomer, saveSupplier } from '../state/mutations';
import { money, toMajor } from '../lib/money';
import type { Courier, Customer, Supplier } from '../domain/types';
import { IconPlus, IconUsers } from '../components/ui/icons';

const SEGMENT_TONE: Record<string, 'success' | 'info' | 'warning' | 'danger' | 'neutral'> = {
  vip: 'success',
  'high-value': 'info',
  repeat: 'info',
  new: 'neutral',
  'one-time': 'neutral',
  'at-risk': 'warning',
  'win-back': 'warning',
  'high-return': 'danger',
};

/* ------------------------------------------------------------------ *
 * Customers
 * ------------------------------------------------------------------ */

export function CustomersPage() {
  const { t } = useI18n();
  const fmt = useFmt();
  const { analytics, loading, run } = useWorkspace();
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState('');
  const [segment, setSegment] = useState('all');
  const [editing, setEditing] = useState<Customer | null>(null);

  useEffect(() => {
    if (params.get('new') === '1') {
      setEditing(emptyCustomer());
      setParams({}, { replace: true });
    }
  }, [params, setParams]);

  if (loading || !analytics) return <Card><p className="muted small">{t('common.loading')}</p></Card>;

  const rows = analytics.customers.filter((c) => {
    const q = query.trim().toLowerCase();
    if (q && !`${c.customer.name} ${c.customer.phone}`.toLowerCase().includes(q)) return false;
    if (segment !== 'all' && c.segment !== segment) return false;
    return true;
  });

  const columns: Column<CustomerRow>[] = [
    { key: 'name', label: t('common.name'), render: (c) => <Link to={`/customers/${c.customer.id}`} style={{ fontWeight: 500 }}>{c.customer.name}</Link>, sortValue: (c) => c.customer.name },
    { key: 'phone', label: t('common.phone'), render: (c) => c.customer.phone || '—', sortValue: (c) => c.customer.phone, hideOnMobile: true },
    { key: 'city', label: t('common.city'), render: (c) => c.customer.city || '—', sortValue: (c) => c.customer.city, hideOnMobile: true },
    { key: 'orders', label: t('kpi.orders'), numeric: true, render: (c) => fmt.num(c.orders), sortValue: (c) => c.orders },
    { key: 'revenue', label: t('finance.netRevenue'), numeric: true, render: (c) => fmt.money(c.revenue), sortValue: (c) => c.revenue },
    {
      key: 'profit',
      label: t('kpi.contributionProfit'),
      numeric: true,
      render: (c) => <span style={{ color: c.profit < 0 ? 'var(--fin-loss)' : 'var(--fin-profit)' }}>{fmt.money(c.profit)}</span>,
      sortValue: (c) => c.profit,
    },
    { key: 'ltv', label: t('customers.ltv'), numeric: true, render: (c) => fmt.money(c.ltv), sortValue: (c) => c.ltv, hideOnMobile: true },
    { key: 'return', label: t('kpi.returnRate'), numeric: true, render: (c) => fmt.pct(c.returnRatePct), sortValue: (c) => c.returnRatePct, hideOnMobile: true },
    { key: 'last', label: t('customers.lastOrder'), render: (c) => (c.lastOrderDate ? fmt.date(c.lastOrderDate) : '—'), sortValue: (c) => c.lastOrderDate, hideOnMobile: true },
    { key: 'segment', label: t('customers.segment'), render: (c) => <Chip tone={SEGMENT_TONE[c.segment] ?? 'neutral'}>{t(`customers.segment.${c.segment}`)}</Chip>, sortValue: (c) => c.segment },
  ];

  const segmentDonut = (() => {
    const map = new Map<string, number>();
    for (const c of analytics.customers) map.set(c.segment, (map.get(c.segment) ?? 0) + 1);
    return [...map.entries()].map(([key, value]) => ({ label: t(`customers.segment.${key}`), value }));
  })();

  const topBars = analytics.customers
    .slice()
    .sort((a, b) => b.profit - a.profit)
    .slice(0, 8)
    .map((c) => ({ id: c.customer.id, label: clip(c.customer.name), value: c.profit / 100 }));

  const repeat = analytics.customers.filter((c) => c.orders > 1).length;
  const repeatPct = analytics.customers.length > 0 ? (repeat / analytics.customers.length) * 100 : null;
  const atRisk = analytics.customers.filter((c) => c.segment === 'at-risk' || c.segment === 'win-back').length;
  const vip = analytics.customers.filter((c) => c.segment === 'vip').length;
  const avgLtv = analytics.customers.length > 0 ? analytics.customers.reduce((a, c) => a + c.ltv, 0) / analytics.customers.length : 0;

  return (
    <>
      <PageHeader
        title={t('customers.title')}
        subtitle={`${fmt.num(analytics.customers.length)} · ${fmt.money(analytics.customers.reduce((a, c) => a + c.revenue, 0))}`}
        actions={
          <Button variant="primary" icon={<IconPlus size={15} />} onClick={() => setEditing(emptyCustomer())}>
            {t('customers.new')}
          </Button>
        }
      >
        <div className="mt-4">
          <PeriodPicker />
        </div>
      </PageHeader>

      <div className="grid grid--kpi mb-5">
        <div className="metric"><span className="metric__label">{t('kpi.customers')}</span><span className="metric__value metric__value--sm">{fmt.num(analytics.customers.length)}</span></div>
        <div className="metric"><span className="metric__label">{t('kpi.newCustomers')}</span><span className="metric__value metric__value--sm">{fmt.num(analytics.metrics.newCustomers)}</span></div>
        <div className="metric"><span className="metric__label">{t('kpi.repeatCustomers')}</span><span className="metric__value metric__value--sm">{fmt.num(repeat)}</span></div>
        <div className="metric"><span className="metric__label">{t('kpi.repeatRate')}</span><span className="metric__value metric__value--sm">{fmt.pct(repeatPct)}</span></div>
        <div className="metric"><span className="metric__label">{t('kpi.customerLifetimeValue')}</span><span className="metric__value metric__value--sm">{fmt.money(Math.round(avgLtv))}</span></div>
        <div className="metric"><span className="metric__label">{t('customers.atRisk')}</span><span className="metric__value metric__value--sm">{fmt.num(atRisk)}</span></div>
        <div className="metric"><span className="metric__label">{t('customers.vip')}</span><span className="metric__value metric__value--sm">{fmt.num(vip)}</span></div>
      </div>

      <Card className="mb-5">
        <div className="grid grid--2">
          <div>
            <h4 className="mb-4">{t('customers.segments')}</h4>
            {segmentDonut.length === 0 ? <p className="muted small">{t('common.noData')}</p> : <DonutChart data={segmentDonut} lang={fmt.lang} currency={fmt.currency} format="number" height={220} />}
          </div>
          <div>
            <h4 className="mb-4">{t('customers.topByProfit')}</h4>
            {topBars.length === 0 ? <p className="muted small">{t('common.noData')}</p> : <HorizontalBarChart data={topBars} lang={fmt.lang} currency={fmt.currency} />}
          </div>
        </div>
      </Card>

      <Card flush>
        <div className="card__body">
          <div className="row gap-3">
            <TextInput placeholder={t('common.search')} aria-label={t('common.search')} value={query} onChange={(e) => setQuery(e.target.value)} style={{ maxWidth: 240 }} />
            <div className="row gap-2">
              {['all', 'vip', 'repeat', 'new', 'at-risk', 'win-back', 'high-return'].map((s) => (
                <Button key={s} size="sm" variant={segment === s ? 'primary' : 'secondary'} onClick={() => setSegment(s)}>
                  {s === 'all' ? t('common.all') : t(`customers.segment.${s}`)}
                </Button>
              ))}
            </div>
          </div>
        </div>
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(c) => c.customer.id}
          onRowClick={(c) => setEditing(c.customer)}
          empty={<EmptyState icon={<IconUsers size={20} />} title={t('empty.customers.title')} body={t('empty.customers.body')} action={<Button variant="primary" onClick={() => setEditing(emptyCustomer())}>{t('empty.customers.cta')}</Button>} />}
          caption={t('customers.title')}
        />
      </Card>

      {editing && (
        <CustomerForm
          customer={editing}
          isNew={!analytics.customers.some((c) => c.customer.id === editing.id)}
          onClose={() => setEditing(null)}
          onSave={async (c) => {
            await run(() => saveCustomer(c));
            setEditing(null);
          }}
        />
      )}
    </>
  );
}

function clip(name: string): string {
  return name.length > 18 ? `${name.slice(0, 17)}…` : name;
}

export function CustomerForm({ customer, isNew, onClose, onSave }: { customer: Customer; isNew: boolean; onClose: () => void; onSave: (c: Customer) => Promise<void> }) {
  const { t } = useI18n();
  const toast = useToast();
  const [draft, setDraft] = useState<Customer>(customer);
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      open
      onClose={onClose}
      title={isNew ? t('customers.new') : t('customers.edit')}
      subtitle={draft.name}
      footer={
        <>
          <Button onClick={onClose}>{t('action.cancel')}</Button>
          <Button
            variant="primary"
            disabled={busy}
            onClick={async () => {
              if (!draft.name.trim()) {
                toast.push(t('error.validation'), 'danger');
                return;
              }
              setBusy(true);
              try {
                await onSave(draft);
                toast.push(t('app.saved'), 'success');
              } finally {
                setBusy(false);
              }
            }}
          >
            {t('action.save')}
          </Button>
        </>
      }
    >
      <div className="row gap-3">
        <TextInput label={t('common.name')} required value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
        <TextInput label={t('common.phone')} value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} />
        <TextInput label={t('common.email')} value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} />
        <TextInput label={t('common.city')} value={draft.city} onChange={(e) => setDraft({ ...draft, city: e.target.value })} />
        <TextInput label={t('common.address')} value={draft.address} onChange={(e) => setDraft({ ...draft, address: e.target.value })} />
        <TextInput label={t('customers.source')} value={draft.source} onChange={(e) => setDraft({ ...draft, source: e.target.value })} />
        <TextInput label={t('products.field.tags')} value={draft.tags.join(', ')} onChange={(e) => setDraft({ ...draft, tags: e.target.value.split(',').map((x) => x.trim()).filter(Boolean) })} />
        <TextInput label={t('common.notes')} value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />
      </div>
    </Modal>
  );
}

export function CustomerDetailPage() {
  const { id } = useParams();
  const { t } = useI18n();
  const fmt = useFmt();
  const { data, analytics, run } = useWorkspace();
  const navigate = useNavigate();
  const toast = useToast();
  const [editing, setEditing] = useState(false);

  const customer = data?.customers.find((c) => c.id === id);
  const row = analytics?.customers.find((c) => c.customer.id === id);
  if (!customer || !analytics) {
    return <Card><EmptyState title={t('error.notFound.title')} body={t('error.notFound.body')} action={<Button onClick={() => navigate('/customers')}>{t('common.back')}</Button>} /></Card>;
  }

  const allOrders = (data?.orders ?? []).filter((o) => o.customerId === customer.id).sort((a, b) => (a.date < b.date ? 1 : -1));
  const lifetimeRevenue = allOrders.reduce((a, o) => a + (analytics.metrics.orderEconomicsByOrder.get(o.id)?.netRevenue ?? 0), 0);
  const lifetimeProfit = allOrders.reduce((a, o) => a + (analytics.metrics.orderEconomicsByOrder.get(o.id)?.contributionProfit ?? 0), 0);
  const orderIds = new Set(allOrders.map((o) => o.id));
  const lifetimeReturns = (data?.returns ?? []).filter((r) => orderIds.has(r.orderId)).reduce((a, r) => a + r.qty, 0);
  const firstOrder = allOrders.reduce((a, b) => (a.date < b.date ? a : b), allOrders[0]);
  const lastOrder = allOrders.reduce((a, b) => (a.date > b.date ? a : b), allOrders[0]);

  return (
    <>
      <PageHeader
        title={customer.name}
        subtitle={`${customer.phone || '—'} · ${customer.city || '—'}${row ? ` · ${t(`customers.segment.${row.segment}`)}` : ''}`}
        actions={
          <Button variant="secondary" onClick={() => setEditing(true)}>
            {t('action.edit')}
          </Button>
        }
      >
        <div className="mt-4">
          <PeriodPicker />
        </div>
      </PageHeader>

      <div className="grid grid--kpi mb-5">
        <div className="metric"><span className="metric__label">{t('customers.lifetimeOrders')}</span><span className="metric__value metric__value--sm">{fmt.num(allOrders.length)}</span></div>
        <div className="metric"><span className="metric__label">{t('customers.lifetimeRevenue')}</span><span className="metric__value metric__value--sm">{fmt.money(lifetimeRevenue)}</span></div>
        <div className="metric"><span className="metric__label">{t('customers.lifetimeProfit')}</span><span className={`metric__value metric__value--sm ${lifetimeProfit >= 0 ? 'money-positive' : 'money-negative'}`}>{fmt.money(lifetimeProfit)}</span></div>
        <div className="metric"><span className="metric__label">{t('kpi.aov')}</span><span className="metric__value metric__value--sm">{allOrders.length > 0 ? fmt.money(Math.round(lifetimeRevenue / allOrders.length)) : '—'}</span></div>
        <div className="metric"><span className="metric__label">{t('customers.returns')}</span><span className="metric__value metric__value--sm">{fmt.num(lifetimeReturns)}</span></div>
        <div className="metric"><span className="metric__label">{t('kpi.returnRate')}</span><span className="metric__value metric__value--sm">{fmt.pct(row?.returnRatePct ?? null)}</span></div>
      </div>

      <div className="grid grid--2 mb-5">
        <Card title={t('common.details')}>
          <KeyValue
            rows={[
              { label: t('common.name'), value: customer.name },
              { label: t('common.phone'), value: customer.phone || '—' },
              { label: t('common.email'), value: customer.email || '—' },
              { label: t('common.city'), value: customer.city || '—' },
              { label: t('common.address'), value: customer.address || '—' },
              { label: t('customers.source'), value: customer.source || '—' },
              { label: t('customers.firstOrder'), value: firstOrder ? fmt.date(firstOrder.date) : '—' },
              { label: t('customers.lastOrder'), value: lastOrder ? fmt.date(lastOrder.date) : '—', divider: true },
              { label: t('common.notes'), value: customer.notes || '—' },
            ]}
          />
        </Card>
        <Card title={t('customers.periodSummary')}>
          {row ? (
            <KeyValue
              rows={[
                { label: t('finance.netRevenue'), value: fmt.money(row.revenue) },
                { label: t('kpi.orders'), value: fmt.num(row.orders) },
                { label: t('kpi.aov'), value: row.aov === null ? '—' : fmt.money(Math.round(row.aov * 100)) },
                { label: t('customers.profitPerOrder'), value: fmt.money(row.profitPerOrder) },
                { label: t('kpi.contributionProfit'), value: fmt.money(row.profit), tone: row.profit >= 0 ? 'positive' : 'negative' },
                { label: t('kpi.contributionMargin'), value: fmt.pct(row.revenue > 0 ? (row.profit / row.revenue) * 100 : null), divider: true },
                { label: t('customers.ltv'), value: fmt.money(row.ltv) },
                { label: t('customers.repeatRate'), value: fmt.pct(row.repeatRatePct) },
                { label: t('customers.daysSinceLastOrder'), value: row.daysSinceLastOrder === null ? '—' : fmt.num(row.daysSinceLastOrder, 0) },
                { label: t('customers.segment'), value: t(`customers.segment.${row.segment}`) },
              ]}
            />
          ) : (
            <EmptyState title={t('empty.customers.title')} body={t('empty.customers.body')} />
          )}
        </Card>
      </div>

      <Card title={t('customers.orderHistory')} flush>
        <DataTable
          columns={[
            { key: 'no', label: t('orders.orderNo'), render: (o: (typeof allOrders)[number]) => <Link to={`/orders/${o.id}`}>{o.orderNo}</Link>, sortValue: (o) => o.orderNo },
            { key: 'date', label: t('common.date'), render: (o) => fmt.date(o.date), sortValue: (o) => o.date },
            { key: 'rev', label: t('finance.netRevenue'), numeric: true, render: (o) => fmt.money(analytics.metrics.orderEconomicsByOrder.get(o.id)?.netRevenue ?? 0), sortValue: (o) => analytics.metrics.orderEconomicsByOrder.get(o.id)?.netRevenue ?? 0 },
            { key: 'profit', label: t('orders.contribution'), numeric: true, render: (o) => fmt.money(analytics.metrics.orderEconomicsByOrder.get(o.id)?.contributionProfit ?? 0), sortValue: (o) => analytics.metrics.orderEconomicsByOrder.get(o.id)?.contributionProfit ?? 0 },
            { key: 'status', label: t('orders.deliveryStatus'), render: (o) => <Chip tone="outline">{t(`status.${o.status}`)}</Chip>, sortValue: (o) => o.status },
          ]}
          rows={allOrders}
          rowKey={(o) => o.id}
          empty={<EmptyState title={t('empty.orders.title')} body={t('empty.orders.body')} />}
        />
      </Card>

      {editing && (
        <CustomerForm
          customer={customer}
          isNew={false}
          onClose={() => setEditing(false)}
          onSave={async (c) => {
            await run(() => saveCustomer(c));
            setEditing(false);
            toast.push(t('app.saved'), 'success');
          }}
        />
      )}
    </>
  );
}

/* ------------------------------------------------------------------ *
 * Suppliers
 * ------------------------------------------------------------------ */

export function SuppliersPage() {
  const { t } = useI18n();
  const fmt = useFmt();
  const { analytics, data, loading, run } = useWorkspace();
  const [editing, setEditing] = useState<Supplier | null>(null);
  const toast = useToast();

  if (loading || !analytics) return <Card><p className="muted small">{t('common.loading')}</p></Card>;

  const rows = analytics.suppliers;
  const columns: Column<SupplierRow>[] = [
    { key: 'name', label: t('common.name'), render: (s) => s.supplier.name, sortValue: (s) => s.supplier.name },
    { key: 'phone', label: t('common.phone'), render: (s) => s.supplier.phone || '—', sortValue: (s) => s.supplier.phone, hideOnMobile: true },
    { key: 'orders', label: t('purchases.title'), numeric: true, render: (s) => fmt.num(s.orders), sortValue: (s) => s.orders },
    { key: 'products', label: t('nav.products'), numeric: true, render: (s) => fmt.num(s.products), sortValue: (s) => s.products, hideOnMobile: true },
    { key: 'spend', label: t('purchases.totalValue'), numeric: true, render: (s) => fmt.money(s.purchaseSpend), sortValue: (s) => s.purchaseSpend },
    { key: 'avg', label: t('suppliers.avgUnitCost'), numeric: true, render: (s) => (s.averageUnitCost === null ? '—' : fmt.money(s.averageUnitCost)), sortValue: (s) => s.averageUnitCost, hideOnMobile: true },
    { key: 'trend', label: t('suppliers.costTrend'), numeric: true, render: (s) => fmt.pct(s.costTrendPct), sortValue: (s) => s.costTrendPct, hideOnMobile: true },
    { key: 'lead', label: t('suppliers.avgLeadTime'), render: (s) => (s.leadTimeDays === null ? '—' : `${fmt.num(s.leadTimeDays, 1)} ${t('common.days')}`), sortValue: (s) => s.leadTimeDays, hideOnMobile: true },
    { key: 'ontime', label: t('suppliers.onTimeRate'), numeric: true, render: (s) => fmt.pct(s.onTimeRatePct), sortValue: (s) => s.onTimeRatePct, hideOnMobile: true },
    { key: 'outstanding', label: t('purchases.outstanding'), numeric: true, render: (s) => fmt.money(s.outstanding), sortValue: (s) => s.outstanding },
    { key: 'share', label: t('suppliers.dependency'), render: (s) => <Bar value={Math.min(100, s.sharePct ?? 0)} tone={(s.sharePct ?? 0) > 60 ? 'danger' : (s.sharePct ?? 0) > 30 ? 'warning' : 'success'} />, sortValue: (s) => s.sharePct },
  ];

  const totalSpend = rows.reduce((a, s) => a + s.purchaseSpend, 0);
  const dependent = rows.filter((s) => (s.sharePct ?? 0) > 60);

  return (
    <>
      <PageHeader
        title={t('suppliers.title')}
        subtitle={`${fmt.num((data?.suppliers ?? []).length)} · ${fmt.money(totalSpend)}`}
        actions={
          <Button variant="primary" icon={<IconPlus size={15} />} onClick={() => setEditing(emptySupplier())}>
            {t('suppliers.new')}
          </Button>
        }
      >
        <div className="mt-4">
          <PeriodPicker />
        </div>
      </PageHeader>

      {dependent.length > 0 && (
        <Card className="mb-5">
          <h4 className="mb-4">{t('suppliers.dependencyWarning')}</h4>
          <KeyValue
            rows={dependent.slice(0, 4).map((s) => ({
              label: s.supplier.name,
              value: `${fmt.pct(s.sharePct)}`,
              tone: 'negative' as const,
            }))}
          />
          <p className="tiny muted mt-4">{t('insights.concentration.warning')}</p>
        </Card>
      )}

      <Card flush>
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(s) => s.supplier.id}
          onRowClick={(s) => setEditing(s.supplier)}
          empty={<EmptyState title={t('empty.suppliers.title')} body={t('empty.suppliers.body')} action={<Button variant="primary" onClick={() => setEditing(emptySupplier())}>{t('empty.suppliers.cta')}</Button>} />}
          caption={t('suppliers.title')}
        />
      </Card>

      {editing && (
        <Modal
          open
          onClose={() => setEditing(null)}
          title={t('suppliers.new')}
          footer={
            <>
              <Button onClick={() => setEditing(null)}>{t('action.cancel')}</Button>
              <Button
                variant="primary"
                onClick={async () => {
                  if (!editing.name.trim()) {
                    toast.push(t('error.validation'), 'danger');
                    return;
                  }
                  await run(() => saveSupplier(editing));
                  setEditing(null);
                  toast.push(t('app.saved'), 'success');
                }}
              >
                {t('action.save')}
              </Button>
            </>
          }
        >
          <div className="row gap-3">
            <TextInput label={t('common.name')} required value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
            <TextInput label={t('common.phone')} value={editing.phone} onChange={(e) => setEditing({ ...editing, phone: e.target.value })} />
            <TextInput label={t('common.email')} value={editing.email} onChange={(e) => setEditing({ ...editing, email: e.target.value })} />
            <TextInput label={t('common.address')} value={editing.address} onChange={(e) => setEditing({ ...editing, address: e.target.value })} />
            <TextInput label={t('common.notes')} value={editing.notes} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} />
          </div>
        </Modal>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ *
 * Couriers
 * ------------------------------------------------------------------ */

export function CouriersPage() {
  const { t } = useI18n();
  const fmt = useFmt();
  const { analytics, loading, run } = useWorkspace();
  const [params, setParams] = useSearchParams();
  const [editing, setEditing] = useState<Courier | null>(null);
  const toast = useToast();

  useEffect(() => {
    if (params.get('new') === '1') {
      setEditing(emptyCourier());
      setParams({}, { replace: true });
    }
  }, [params, setParams]);

  if (loading || !analytics) return <Card><p className="muted small">{t('common.loading')}</p></Card>;

  const rows = analytics.couriers;
  const columns: Column<CourierRow>[] = [
    { key: 'name', label: t('common.name'), render: (c) => c.courier.name, sortValue: (c) => c.courier.name },
    { key: 'orders', label: t('kpi.orders'), numeric: true, render: (c) => fmt.num(c.orders), sortValue: (c) => c.orders },
    { key: 'success', label: t('couriers.successRate'), numeric: true, render: (c) => fmt.pct(c.deliverySuccessPct), sortValue: (c) => c.deliverySuccessPct },
    { key: 'returns', label: t('kpi.returnRate'), numeric: true, render: (c) => fmt.pct(c.returnRatePct), sortValue: (c) => c.returnRatePct, hideOnMobile: true },
    { key: 'revenue', label: t('finance.netRevenue'), numeric: true, render: (c) => fmt.money(c.revenue), sortValue: (c) => c.revenue },
    { key: 'fees', label: t('couriers.fees'), numeric: true, render: (c) => fmt.money(c.totalFees), sortValue: (c) => c.totalFees },
    { key: 'perDelivered', label: t('couriers.feePerDelivered'), numeric: true, render: (c) => fmt.money(c.feePerDelivered), sortValue: (c) => c.feePerDelivered, hideOnMobile: true },
    { key: 'failed', label: t('couriers.failedCost'), numeric: true, render: (c) => fmt.money(c.failedDeliveryCost), sortValue: (c) => c.failedDeliveryCost, hideOnMobile: true },
    { key: 'returnCost', label: t('couriers.returnCost'), numeric: true, render: (c) => fmt.money(c.returnCost), sortValue: (c) => c.returnCost, hideOnMobile: true },
    {
      key: 'net',
      label: t('couriers.netContribution'),
      numeric: true,
      render: (c) => <span style={{ color: c.netContribution < 0 ? 'var(--fin-loss)' : 'var(--fin-profit)' }}>{fmt.money(c.netContribution)}</span>,
      sortValue: (c) => c.netContribution,
    },
    { key: 'cod', label: t('kpi.pendingCod'), numeric: true, render: (c) => fmt.money(c.codOutstanding), sortValue: (c) => c.codOutstanding },
    { key: 'settle', label: t('couriers.settlementDays'), numeric: true, render: (c) => fmt.num(c.settlementLagDays, 0), sortValue: (c) => c.settlementLagDays, hideOnMobile: true },
  ];

  const sampled = rows.filter((c) => c.orders >= 5);
  const best = sampled.slice().sort((a, b) => b.netContribution - a.netContribution)[0];
  const worst = sampled.slice().sort((a, b) => (a.deliverySuccessPct ?? 0) - (b.deliverySuccessPct ?? 0))[0];

  return (
    <>
      <PageHeader
        title={t('couriers.title')}
        subtitle={t('couriers.subtitle')}
        actions={
          <Button variant="primary" icon={<IconPlus size={15} />} onClick={() => setEditing(emptyCourier())}>
            {t('couriers.new')}
          </Button>
        }
      >
        <div className="mt-4">
          <PeriodPicker />
        </div>
      </PageHeader>

      <div className="grid grid--2 mb-5">
        <Card title={t('couriers.performance')}>
          {rows.length === 0 ? (
            <EmptyState title={t('empty.couriers.title')} body={t('empty.couriers.body')} />
          ) : (
            <HorizontalBarChart
              data={rows.slice(0, 8).map((c) => ({ id: c.courier.id, label: clip(c.courier.name), value: c.netContribution / 100 }))}
              lang={fmt.lang}
              currency={fmt.currency}
            />
          )}
        </Card>
        <Card title={t('couriers.decision')}>
          {best && worst ? (
            <KeyValue
              rows={[
                { label: t('couriers.bestNet'), value: `${best.courier.name} · ${fmt.money(best.netContribution)}`, tone: 'positive' },
                { label: t('couriers.lowestSuccess'), value: `${worst.courier.name} · ${fmt.pct(worst.deliverySuccessPct)}`, tone: 'negative', divider: true },
                { label: t('couriers.fees'), value: fmt.money(rows.reduce((a, c) => a + c.totalFees, 0)) },
                { label: t('couriers.failedCost'), value: fmt.money(rows.reduce((a, c) => a + c.failedDeliveryCost, 0)) },
                { label: t('couriers.returnCost'), value: fmt.money(rows.reduce((a, c) => a + c.returnCost, 0)) },
                { label: t('kpi.pendingCod'), value: fmt.money(rows.reduce((a, c) => a + c.codOutstanding, 0)) },
                { label: t('couriers.netContribution'), value: fmt.money(rows.reduce((a, c) => a + c.netContribution, 0)), total: true },
              ]}
            />
          ) : (
            <p className="muted small">{t('common.notEnoughData')}</p>
          )}
        </Card>
      </div>

      <Card flush>
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(c) => c.courier.id}
          onRowClick={(c) => setEditing(c.courier)}
          empty={<EmptyState title={t('empty.couriers.title')} body={t('empty.couriers.body')} action={<Button variant="primary" onClick={() => setEditing(emptyCourier())}>{t('empty.couriers.cta')}</Button>} />}
          caption={t('couriers.title')}
        />
      </Card>

      {editing && (
        <Modal
          open
          onClose={() => setEditing(null)}
          title={t('couriers.new')}
          footer={
            <>
              <Button onClick={() => setEditing(null)}>{t('action.cancel')}</Button>
              <Button
                variant="primary"
                onClick={async () => {
                  if (!editing.name.trim()) {
                    toast.push(t('error.validation'), 'danger');
                    return;
                  }
                  await run(() => saveCourier(editing));
                  setEditing(null);
                  toast.push(t('app.saved'), 'success');
                }}
              >
                {t('action.save')}
              </Button>
            </>
          }
        >
          <div className="row gap-3">
            <TextInput label={t('common.name')} required value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
            <TextInput label={t('couriers.deliveryFee')} money value={String(toMajor(editing.deliveryFee))} onChange={(e) => setEditing({ ...editing, deliveryFee: money(e.target.value) })} />
            <TextInput label={t('couriers.codFee')} money value={String(toMajor(editing.codFee))} onChange={(e) => setEditing({ ...editing, codFee: money(e.target.value) })} />
            <TextInput label={t('couriers.codFeePct')} value={String(editing.codFeePct)} onChange={(e) => setEditing({ ...editing, codFeePct: Number(e.target.value) || 0 })} />
            <TextInput label={t('couriers.settlementDays')} value={String(editing.settlementDays)} onChange={(e) => setEditing({ ...editing, settlementDays: Number(e.target.value) || 0 })} />
            <TextInput label={t('common.notes')} value={editing.notes} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} />
          </div>
          <div className="mt-4">
            <Switch label={t('status.active')} checked={editing.active} onChange={(v) => setEditing({ ...editing, active: v })} />
          </div>
        </Modal>
      )}
    </>
  );
}
