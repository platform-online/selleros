import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useI18n } from '../i18n';
import { useWorkspace } from '../state/workspace';
import { useFmt } from '../state/format';
import { PageHeader } from '../components/layout/PageHeader';
import { PeriodPicker } from '../components/layout/PeriodPicker';
import {
  Button,
  Card,
  Chip,
  ConfirmDialog,
  EmptyState,
  Field,
  KeyValue,
  Modal,
  SelectInput,
  Tabs,
  TabPanel,
  TextInput,
  useToast,
} from '../components/ui/primitives';
import { DataTable, type Column } from '../components/ui/DataTable';
import {
  addPayment,
  deleteOrder,
  emptyCustomer,
  emptyOrder,
  emptyReturn,
  nextOrderNumber,
  saveCustomer,
  saveOrder,
  saveReturn,
  type DraftLine,
} from '../state/mutations';
import { money, roundMinor, sub, toMajor, type Money } from '../lib/money';
import { ORDER_STATUSES, RETURN_REASONS } from '../domain/defaults';
import type { Order, ReturnRecord } from '../domain/types';
import { IconCart, IconPlus } from '../components/ui/icons';

export function OrdersPage() {
  const { t } = useI18n();
  const fmt = useFmt();
  const { analytics, data, loading, run } = useWorkspace();
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const [channel, setChannel] = useState('all');
  const [editing, setEditing] = useState<Order | null>(null);
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [tab, setTab] = useState('orders');

  useEffect(() => {
    if (params.get('new') === '1') void openNew();
    if (params.get('newReturn') === '1') setTab('returns');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  const openNew = async () => {
    const no = await nextOrderNumber();
    const order = { ...emptyOrder(), orderNo: no };
    setEditing(order);
    setLines([]);
    setParams({}, { replace: true });
  };

  if (loading || !analytics) return <Card><p className="muted small">{t('common.loading')}</p></Card>;

  const orders = analytics.period.orders;
  const returns = analytics.period.returns;
  const damages = (data?.damages ?? []).filter((d) => d.date >= analytics.range.start && d.date <= analytics.range.end);

  const rows = orders.filter((o) => {
    const q = query.trim().toLowerCase();
    const customer = data?.customers.find((c) => c.id === o.customerId);
    if (q && !`${o.orderNo} ${o.trackingId} ${customer?.name ?? ''}`.toLowerCase().includes(q)) return false;
    if (status !== 'all' && o.status !== status) return false;
    if (channel !== 'all' && o.channel !== channel) return false;
    return true;
  });

  const columns: Column<(typeof orders)[number]>[] = [
    { key: 'no', label: t('orders.orderNo'), render: (o) => <Link to={`/orders/${o.id}`} style={{ fontWeight: 500 }}>{o.orderNo}</Link>, sortValue: (o) => o.orderNo },
    { key: 'date', label: t('common.date'), render: (o) => fmt.date(o.date), sortValue: (o) => o.date },
    { key: 'customer', label: t('orders.customer'), render: (o) => data?.customers.find((c) => c.id === o.customerId)?.name ?? '—', sortValue: (o) => data?.customers.find((c) => c.id === o.customerId)?.name ?? '' },
    { key: 'channel', label: t('orders.channel'), render: (o) => o.channel, sortValue: (o) => o.channel, hideOnMobile: true },
    { key: 'courier', label: t('orders.courier'), render: (o) => data?.couriers.find((c) => c.id === o.courierId)?.name ?? '—', sortValue: (o) => data?.couriers.find((c) => c.id === o.courierId)?.name ?? '', hideOnMobile: true },
    { key: 'revenue', label: t('kpi.netRevenue'), numeric: true, render: (o) => fmt.money(analytics.metrics.orderEconomicsByOrder.get(o.id)?.netRevenue ?? 0), sortValue: (o) => analytics.metrics.orderEconomicsByOrder.get(o.id)?.netRevenue ?? 0 },
    { key: 'profit', label: t('orders.contribution'), numeric: true, render: (o) => { const v = analytics.metrics.orderEconomicsByOrder.get(o.id)?.contributionProfit ?? 0; return <span style={{ color: v < 0 ? 'var(--fin-loss)' : 'var(--fin-profit)' }}>{fmt.money(v)}</span>; }, sortValue: (o) => analytics.metrics.orderEconomicsByOrder.get(o.id)?.contributionProfit ?? 0 },
    { key: 'payment', label: t('orders.paymentStatus'), render: (o) => <Chip tone={o.paymentStatus === 'paid' ? 'success' : o.paymentStatus === 'partial' ? 'warning' : o.paymentStatus === 'refunded' ? 'info' : 'neutral'}>{t(`status.${o.paymentStatus}`)}</Chip>, sortValue: (o) => o.paymentStatus },
    { key: 'status', label: t('orders.deliveryStatus'), render: (o) => <Chip tone={o.status === 'delivered' ? 'success' : o.status === 'cancelled' || o.status === 'failed' ? 'danger' : o.status === 'returned' ? 'warning' : 'info'}>{t(`status.${o.status}`)}</Chip>, sortValue: (o) => o.status },
  ];

  return (
    <>
      <PageHeader
        title={t('orders.title')}
        subtitle={`${fmt.num(orders.length)} · ${fmt.money(analytics.metrics.pl.netRevenue)} ${t('kpi.netRevenue').toLowerCase()}`}
        actions={
          <Button variant="primary" icon={<IconPlus size={15} />} onClick={openNew}>
            {t('orders.new')}
          </Button>
        }
      >
        <div className="mt-4">
          <PeriodPicker />
        </div>
      </PageHeader>

      <Card className="mb-5" flush>
        <div className="card__body" style={{ paddingBottom: 0 }}>
          <Tabs
            ariaLabel={t('orders.title')}
            active={tab}
            onChange={setTab}
            items={[
              { id: 'orders', label: t('orders.title'), count: orders.length },
              { id: 'returns', label: t('returns.title'), count: returns.length },
              { id: 'damages', label: t('damages.title'), count: damages.length },
            ]}
          />
        </div>

        {tab === 'orders' && (
          <TabPanel id="orders">
            <div className="card__body">
              <div className="row gap-3 mb-4">
                <TextInput placeholder={t('common.search')} aria-label={t('common.search')} value={query} onChange={(e) => setQuery(e.target.value)} style={{ maxWidth: 260 }} />
                <SelectInput aria-label={t('orders.deliveryStatus')} value={status} onChange={(e) => setStatus(e.target.value)} options={[{ value: 'all', label: t('common.all') }, ...ORDER_STATUSES.map((s) => ({ value: s, label: t(`status.${s}`) }))]} />
                <SelectInput aria-label={t('orders.channel')} value={channel} onChange={(e) => setChannel(e.target.value)} options={[{ value: 'all', label: t('common.all') }, ...(data?.settings.orderChannels ?? []).map((c) => ({ value: c, label: c }))]} />
              </div>
            </div>
            {rows.length === 0 ? (
              <EmptyState icon={<IconCart size={20} />} title={t('empty.orders.title')} body={t('empty.orders.body')} action={<Button variant="primary" onClick={openNew}>{t('empty.orders.cta')}</Button>} />
            ) : (
              <DataTable columns={columns} rows={rows} rowKey={(o) => o.id} caption={t('orders.title')} />
            )}
          </TabPanel>
        )}

        {tab === 'returns' && (
          <TabPanel id="returns">
            <ReturnsTab />
          </TabPanel>
        )}

        {tab === 'damages' && (
          <TabPanel id="damages">
            <DamagesTab />
          </TabPanel>
        )}
      </Card>

      {editing && (
        <OrderForm
          order={editing}
          lines={lines}
          onClose={() => setEditing(null)}
          onSave={async (o, ls, payment) => {
            await run(() => saveOrder({ order: o, lines: ls, payment }));
            setEditing(null);
          }}
        />
      )}
    </>
  );
}

/* ------------------------------------------------------------------ *
 * Order form
 * ------------------------------------------------------------------ */

export function OrderForm({
  order,
  lines,
  onClose,
  onSave,
}: {
  order: Order;
  lines: DraftLine[];
  onClose: () => void;
  onSave: (order: Order, lines: DraftLine[], payment?: { amount: Money; method: string; type: 'in' | 'refund' | 'settlement' }) => Promise<void>;
}) {
  const { t } = useI18n();
  const fmt = useFmt();
  const { data, settings, run } = useWorkspace();
  const toast = useToast();
  const [draft, setDraft] = useState<Order>(order);
  const [items, setItems] = useState<DraftLine[]>(
    lines.length > 0
      ? lines
      : [{ productId: '', qty: 1, unitPrice: 0, discount: 0 }],
  );
  const [payAmount, setPayAmount] = useState<Money>(0);
  const [payMethod, setPayMethod] = useState('COD');
  const [busy, setBusy] = useState(false);
  const [newCustomer, setNewCustomer] = useState(false);

  const existingItems = useMemo(() => {
    if (lines.length > 0) return lines;
    return (data?.orderItems ?? [])
      .filter((i) => i.orderId === order.id)
      .map((i) => ({ productId: i.productId, qty: i.qty, unitPrice: i.unitPrice, discount: i.discount }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order.id, data?.orderItems]);

  useEffect(() => {
    if (existingItems.length > 0 && lines.length === 0) setItems(existingItems);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const products = data?.products ?? [];
  const gross = items.reduce((a, i) => a + roundMinor(i.unitPrice * i.qty), 0);
  const totalDiscount = sub(draft.discount, ...items.map((i) => -i.discount));
  const netRevenue = sub(gross, draft.discount, ...items.map((i) => i.discount)) + draft.shippingCharged;

  const set = <K extends keyof Order>(key: K, value: Order[K]) => setDraft((d) => ({ ...d, [key]: value }));

  const updateLine = (index: number, patch: Partial<DraftLine>) =>
    setItems((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)));

  const submit = async () => {
    const valid = items.filter((i) => i.productId && i.qty > 0);
    if (valid.length === 0) {
      toast.push(t('error.validation'), 'danger');
      return;
    }
    setBusy(true);
    try {
      await onSave(draft, valid, payAmount > 0 ? { amount: payAmount, method: payMethod, type: 'in' } : undefined);
      toast.push(t('app.saved'), 'success');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      title={order.orderNo ? t('orders.edit') : t('orders.new')}
      subtitle={draft.orderNo}
      footer={
        <>
          <Button onClick={onClose}>{t('action.cancel')}</Button>
          <Button variant="primary" onClick={submit} disabled={busy}>
            {busy ? t('app.saving') : t('action.save')}
          </Button>
        </>
      }
    >
      <div className="stack">
        <section className="form-section">
          <div className="form-section__head">{t('common.overview')}</div>
          <div className="form-section__body">
            <TextInput label={t('orders.orderNo')} value={draft.orderNo} onChange={(e) => set('orderNo', e.target.value)} />
            <TextInput label={t('common.date')} type="date" value={draft.date} onChange={(e) => set('date', e.target.value)} />
            <SelectInput
              label={t('orders.customer')}
              value={draft.customerId ?? ''}
              onChange={(e) => set('customerId', e.target.value || null)}
              options={[{ value: '', label: t('orders.selectCustomer') }, ...(data?.customers ?? []).map((c) => ({ value: c.id, label: `${c.name}${c.phone ? ` · ${c.phone}` : ''}` }))]}
            />
            <Button size="sm" variant="secondary" onClick={() => setNewCustomer(true)}>
              {t('orders.newCustomer')}
            </Button>
            <SelectInput label={t('orders.channel')} value={draft.channel} onChange={(e) => set('channel', e.target.value)} options={(settings?.orderChannels ?? []).map((c) => ({ value: c, label: c }))} />
            <SelectInput label={t('orders.courier')} value={draft.courierId ?? ''} onChange={(e) => set('courierId', e.target.value || null)} options={[{ value: '', label: '—' }, ...(data?.couriers ?? []).map((c) => ({ value: c.id, label: c.name }))]} />
            <SelectInput label={t('orders.deliveryStatus')} value={draft.status} onChange={(e) => set('status', e.target.value as Order['status'])} options={ORDER_STATUSES.map((s) => ({ value: s, label: t(`status.${s}`) }))} />
            <TextInput label={t('orders.trackingId')} value={draft.trackingId} onChange={(e) => set('trackingId', e.target.value)} />
          </div>
        </section>

        <section className="form-section">
          <div className="form-section__head">{t('orders.items')}</div>
          <div className="card__body stack">
            {items.map((line, index) => {
              const product = products.find((p) => p.id === line.productId);
              return (
                <div key={index} className="row gap-2" style={{ alignItems: 'flex-end' }}>
                  <div style={{ flex: '2 1 200px', minWidth: 160 }}>
                    <SelectInput
                      aria-label={t('nav.products')}
                      value={line.productId}
                      onChange={(e) => {
                        const p = products.find((x) => x.id === e.target.value);
                        updateLine(index, { productId: e.target.value, unitPrice: p?.sellingPrice ?? line.unitPrice });
                      }}
                      options={[{ value: '', label: '—' }, ...products.map((p) => ({ value: p.id, label: `${p.name} (${p.sku})` }))]}
                    />
                  </div>
                  <div style={{ flex: '0 0 84px' }}>
                    <TextInput aria-label={t('common.qty')} value={String(line.qty)} onChange={(e) => updateLine(index, { qty: Number(e.target.value) || 0 })} />
                  </div>
                  <div style={{ flex: '1 1 120px' }}>
                    <TextInput aria-label={t('common.price')} money value={String(toMajor(line.unitPrice))} onChange={(e) => updateLine(index, { unitPrice: money(e.target.value) })} />
                  </div>
                  <div style={{ flex: '0 0 100px' }}>
                    <TextInput aria-label={t('orders.discount')} money value={String(toMajor(line.discount))} onChange={(e) => updateLine(index, { discount: money(e.target.value) })} />
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={t('action.remove')}
                    onClick={() => setItems((prev) => prev.filter((_, i) => i !== index))}
                  >
                    ✕
                  </Button>
                  {product && <span className="tiny muted">{fmt.money(product.sellingPrice)}</span>}
                </div>
              );
            })}
            <Button size="sm" variant="secondary" onClick={() => setItems((prev) => [...prev, { productId: '', qty: 1, unitPrice: 0, discount: 0 }])}>
              {t('action.add')}
            </Button>
          </div>
        </section>

        <section className="form-section">
          <div className="form-section__head">{t('orders.economics')}</div>
          <div className="form-section__body">
            <TextInput label={t('orders.discount')} money value={String(toMajor(draft.discount))} onChange={(e) => set('discount', money(e.target.value))} />
            <TextInput label={t('orders.shippingCharged')} money value={String(toMajor(draft.shippingCharged))} onChange={(e) => set('shippingCharged', money(e.target.value))} />
            <TextInput label={t('orders.deliveryFee')} money value={String(toMajor(draft.deliveryFee))} onChange={(e) => set('deliveryFee', money(e.target.value))} />
            <TextInput label={t('orders.codFee')} money value={String(toMajor(draft.codFee))} onChange={(e) => set('codFee', money(e.target.value))} />
            <TextInput label={t('orders.packaging')} money value={String(toMajor(draft.packagingCost))} onChange={(e) => set('packagingCost', money(e.target.value))} />
            <TextInput label={t('orders.paymentFee')} money value={String(toMajor(draft.paymentFee))} onChange={(e) => set('paymentFee', money(e.target.value))} />
            <TextInput label={t('orders.otherCost')} money value={String(toMajor(draft.otherCost))} onChange={(e) => set('otherCost', money(e.target.value))} />
            <TextInput label={t('orders.adSpend')} money value={String(toMajor(draft.adSpend))} onChange={(e) => set('adSpend', money(e.target.value))} />
          </div>
          <div className="card__body">
            <KeyValue
              tight
              rows={[
                { label: t('finance.grossRevenue'), value: fmt.money(gross) },
                { label: t('finance.discounts'), value: fmt.money(totalDiscount) },
                { label: t('finance.shippingIncome'), value: fmt.money(draft.shippingCharged) },
                { label: t('finance.netRevenue'), value: fmt.money(netRevenue), total: true, divider: true },
              ]}
            />
          </div>
        </section>

        <section className="form-section">
          <div className="form-section__head">{t('orders.paymentMethod')}</div>
          <div className="form-section__body">
            <SelectInput label={t('orders.paymentMethod')} value={payMethod} onChange={(e) => setPayMethod(e.target.value)} options={(settings?.paymentMethods ?? []).map((m) => ({ value: m, label: m }))} />
            <TextInput label={t('orders.paid')} money value={String(toMajor(payAmount))} onChange={(e) => setPayAmount(money(e.target.value))} />
            <SelectInput label={t('orders.paymentStatus')} value={draft.paymentStatus} onChange={(e) => set('paymentStatus', e.target.value as Order['paymentStatus'])} options={[{ value: 'unpaid', label: t('status.unpaid') }, { value: 'partial', label: t('status.partial') }, { value: 'paid', label: t('status.paid') }, { value: 'refunded', label: t('status.refunded') }]} />
          </div>
        </section>

        <section className="form-section">
          <div className="form-section__head">{t('orders.attribution')}</div>
          <div className="form-section__body">
            <SelectInput label={t('ads.platform')} value={draft.attribution.platform} onChange={(e) => set('attribution', { ...draft.attribution, platform: e.target.value })} options={[{ value: '', label: '—' }, { value: 'meta', label: t('ads.platform.meta') }, { value: 'google', label: t('ads.platform.google') }, { value: 'tiktok', label: t('ads.platform.tiktok') }, { value: 'other', label: t('ads.platform.other') }]} />
            <TextInput label={t('ads.campaign')} value={draft.attribution.campaign} onChange={(e) => set('attribution', { ...draft.attribution, campaign: e.target.value })} />
            <TextInput label={t('ads.ad')} value={draft.attribution.ad} onChange={(e) => set('attribution', { ...draft.attribution, ad: e.target.value })} />
            <TextInput label={t('ads.creative')} value={draft.attribution.creative} onChange={(e) => set('attribution', { ...draft.attribution, creative: e.target.value })} />
            <SelectInput label={t('orders.attributionMethod')} value={draft.attribution.method} onChange={(e) => set('attribution', { ...draft.attribution, method: e.target.value as Order['attribution']['method'] })} options={[{ value: 'platform', label: t('ads.attributionMethod.platform') }, { value: 'lastTouch', label: t('ads.attributionMethod.lastTouch') }, { value: 'firstTouch', label: t('ads.attributionMethod.firstTouch') }, { value: 'manual', label: t('ads.attributionMethod.manual') }].map((o) => ({ value: o.value === 'lastTouch' ? 'last-touch' : o.value === 'firstTouch' ? 'first-touch' : o.value, label: o.label }))} />
          </div>
          <div className="card__body">
            <p className="field__help">{t('ads.attributionNote')}</p>
          </div>
        </section>

        <Field label={t('common.notes')}>
          <textarea className="textarea" value={draft.notes} onChange={(e) => set('notes', e.target.value)} />
        </Field>
      </div>

      {newCustomer && (
        <NewCustomerInline
          onClose={() => setNewCustomer(false)}
          onSaved={async () => {
            setNewCustomer(false);
          }}
          onPick={(id) => {
            set('customerId', id);
            setNewCustomer(false);
          }}
          runSave={run}
        />
      )}
    </Modal>
  );
}

function NewCustomerInline({
  onClose,
  onPick,
  runSave,
}: {
  onClose: () => void;
  onSaved: () => void;
  onPick: (id: string) => void;
  runSave: (fn: () => Promise<unknown>) => Promise<void>;
}) {
  const { t } = useI18n();
  const [draft, setDraft] = useState(emptyCustomer());
  const toast = useToast();
  return (
    <div className="panel mt-5">
      <h4 className="mb-4">{t('orders.newCustomer')}</h4>
      <div className="row gap-3">
        <TextInput label={t('common.name')} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
        <TextInput label={t('common.phone')} value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} />
        <TextInput label={t('common.city')} value={draft.city} onChange={(e) => setDraft({ ...draft, city: e.target.value })} />
      </div>
      <div className="row gap-2 mt-4">
        <Button
          variant="primary"
          size="sm"
          onClick={async () => {
            if (!draft.name.trim()) {
              toast.push(t('error.validation'), 'danger');
              return;
            }
            await runSave(() => saveCustomer(draft));
            onPick(draft.id);
            toast.push(t('app.saved'), 'success');
          }}
        >
          {t('action.save')}
        </Button>
        <Button size="sm" onClick={onClose}>
          {t('action.cancel')}
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Order detail
 * ------------------------------------------------------------------ */

export function OrderDetailPage() {
  const { id } = useParams();
  const { t } = useI18n();
  const fmt = useFmt();
  const { data, analytics, run } = useWorkspace();
  const navigate = useNavigate();
  const toast = useToast();
  const [payOpen, setPayOpen] = useState(false);
  const [amount, setAmount] = useState<Money>(0);
  const [method, setMethod] = useState('COD');
  const [confirmDelete, setConfirmDelete] = useState(false);

  const order = data?.orders.find((o) => o.id === id);
  if (!order || !analytics) {
    return <Card><EmptyState title={t('error.notFound.title')} body={t('error.notFound.body')} action={<Button onClick={() => navigate('/orders')}>{t('common.back')}</Button>} /></Card>;
  }

  const items = (data?.orderItems ?? []).filter((i) => i.orderId === order.id);
  const payments = (data?.payments ?? []).filter((p) => p.orderId === order.id);
  const eco = analytics.metrics.orderEconomicsByOrder.get(order.id);
  const customer = data?.customers.find((c) => c.id === order.customerId);
  const courier = data?.couriers.find((c) => c.id === order.courierId);
  const paid = payments.reduce((a, p) => a + (p.type === 'in' ? p.amount : p.type === 'refund' ? -p.amount : 0), 0);
  const due = sub(eco?.netRevenue ?? 0, paid);

  return (
    <>
      <PageHeader
        title={order.orderNo}
        subtitle={`${fmt.date(order.date)} · ${customer?.name ?? '—'} · ${order.channel}`}
        actions={
          <>
            <Button variant="secondary" onClick={() => setPayOpen(true)}>
              {t('orders.recordPayment')}
            </Button>
            <Button variant="danger-quiet" onClick={() => setConfirmDelete(true)}>
              {t('action.delete')}
            </Button>
          </>
        }
      />

      <div className="grid grid--kpi mb-5">
        {[
          { label: t('finance.netRevenue'), value: fmt.money(eco?.netRevenue ?? 0) },
          { label: t('kpi.cogs'), value: fmt.money(eco?.cogs ?? 0) },
          { label: t('orders.paid'), value: fmt.money(paid) },
          { label: t('orders.due'), value: fmt.money(due > 0 ? due : 0), tone: due > 0 ? ('negative' as const) : undefined },
          { label: t('orders.contribution'), value: fmt.money(eco?.contributionProfit ?? 0), tone: (eco?.contributionProfit ?? 0) >= 0 ? ('positive' as const) : ('negative' as const) },
          { label: t('orders.netProfit'), value: fmt.money(eco?.netProfit ?? 0) },
        ].map((k) => (
          <div className="metric" key={k.label}>
            <span className="metric__label">{k.label}</span>
            <span className={`metric__value metric__value--sm ${k.tone === 'positive' ? 'money-positive' : k.tone === 'negative' ? 'money-negative' : ''}`}>{k.value}</span>
          </div>
        ))}
      </div>

      <div className="grid grid--2 mb-5">
        <Card title={t('orders.economics')}>
          <KeyValue
            rows={[
              { label: t('finance.grossRevenue'), value: fmt.money(eco?.grossRevenue ?? 0) },
              { label: t('finance.discounts'), value: fmt.money(eco?.discounts ?? 0) },
              { label: t('finance.shippingIncome'), value: fmt.money(eco?.shippingIncome ?? 0) },
              { label: t('finance.netRevenue'), value: fmt.money(eco?.netRevenue ?? 0), divider: true },
              { label: t('kpi.cogs'), value: fmt.money(eco?.cogs ?? 0) },
              { label: t('finance.packaging'), value: fmt.money(eco?.packaging ?? 0) },
              { label: t('finance.courier'), value: fmt.money(eco?.courier ?? 0) },
              { label: t('finance.paymentFees'), value: fmt.money(eco?.paymentFee ?? 0) },
              { label: t('kpi.adSpend'), value: fmt.money(eco?.adSpend ?? 0) },
              { label: t('finance.returnsCost'), value: fmt.money(eco?.returnCost ?? 0) },
              { label: t('finance.otherVariable'), value: fmt.money(eco?.otherVariable ?? 0) },
              { label: t('kpi.contributionProfit'), value: fmt.money(eco?.contributionProfit ?? 0), divider: true, tone: (eco?.contributionProfit ?? 0) >= 0 ? 'positive' : 'negative' },
              { label: t('finance.operatingExpenses'), value: fmt.money(eco?.operatingAllocation ?? 0) },
              { label: t('kpi.netProfit'), value: fmt.money(eco?.netProfit ?? 0), total: true },
            ]}
          />
          {eco && Object.keys(eco.sources).length > 0 && (
            <p className="tiny muted mt-4">
              {t('common.estimate')}: {Object.entries(eco.sources).map(([k, v]) => `${k}=${v}`).join(', ')}
            </p>
          )}
        </Card>

        <Card title={t('common.details')}>
          <KeyValue
            rows={[
              { label: t('orders.customer'), value: customer?.name ?? '—' },
              { label: t('orders.channel'), value: order.channel },
              { label: t('orders.courier'), value: courier?.name ?? '—' },
              { label: t('orders.trackingId'), value: order.trackingId || '—' },
              { label: t('orders.deliveryStatus'), value: t(`status.${order.status}`) },
              { label: t('orders.paymentStatus'), value: t(`status.${order.paymentStatus}`) },
              { label: t('orders.attributionMethod'), value: t(`ads.attributionMethod.${order.attribution.method === 'last-touch' ? 'lastTouch' : order.attribution.method === 'first-touch' ? 'firstTouch' : order.attribution.method}`) },
              { label: t('ads.campaign'), value: order.attribution.campaign || '—' },
            ]}
          />
        </Card>
      </div>

      <Card title={t('orders.items')} className="mb-5" flush>
        <DataTable
          columns={[
            { key: 'p', label: t('nav.products'), render: (i: (typeof items)[number]) => data?.products.find((p) => p.id === i.productId)?.name ?? i.productId, sortValue: (i) => i.productId },
            { key: 'q', label: t('common.qty'), numeric: true, render: (i) => fmt.num(i.qty), sortValue: (i) => i.qty },
            { key: 'price', label: t('common.price'), numeric: true, render: (i) => fmt.money(i.unitPrice), sortValue: (i) => i.unitPrice },
            { key: 'cost', label: t('products.cost.trueUnit'), numeric: true, render: (i) => fmt.money(i.unitCost), sortValue: (i) => i.unitCost },
            { key: 'total', label: t('common.total'), numeric: true, render: (i) => fmt.money(roundMinor(i.unitPrice * i.qty)), sortValue: (i) => i.unitPrice * i.qty },
          ]}
          rows={items}
          rowKey={(i) => i.id}
        />
      </Card>

      <Card title={t('settings.payments')} flush>
        <DataTable
          columns={[
            { key: 'date', label: t('common.date'), render: (p: (typeof payments)[number]) => fmt.date(p.date), sortValue: (p) => p.date },
            { key: 'method', label: t('orders.paymentMethod'), render: (p) => p.method, sortValue: (p) => p.method },
            { key: 'type', label: t('finance.direction'), render: (p) => <Chip tone={p.type === 'in' ? 'success' : p.type === 'refund' ? 'danger' : 'info'}>{p.type === 'in' ? t('finance.in') : p.type === 'refund' ? t('orders.recordRefund') : t('kpi.pendingSettlement')}</Chip>, sortValue: (p) => p.type },
            { key: 'amount', label: t('common.amount'), numeric: true, render: (p) => fmt.money(p.amount), sortValue: (p) => p.amount },
          ]}
          rows={payments}
          rowKey={(p) => p.id}
          empty={<EmptyState title={t('empty.ledger.title')} body={t('empty.ledger.body')} />}
        />
      </Card>

      <Modal
        open={payOpen}
        onClose={() => setPayOpen(false)}
        size="sm"
        title={t('orders.recordPayment')}
        footer={
          <>
            <Button onClick={() => setPayOpen(false)}>{t('action.cancel')}</Button>
            <Button
              variant="primary"
              onClick={async () => {
                await run(() => addPayment({ orderId: order.id, date: order.date, method, type: 'in', amount, note: '' }));
                setPayOpen(false);
                setAmount(0);
                toast.push(t('app.saved'), 'success');
              }}
            >
              {t('action.save')}
            </Button>
          </>
        }
      >
        <div className="stack">
          <TextInput label={t('common.amount')} money value={String(toMajor(amount))} onChange={(e) => setAmount(money(e.target.value))} />
          <SelectInput label={t('orders.paymentMethod')} value={method} onChange={(e) => setMethod(e.target.value)} options={(data?.settings.paymentMethods ?? []).map((m) => ({ value: m, label: m }))} />
        </div>
      </Modal>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={async () => {
          await run(() => deleteOrder(order.id));
          setConfirmDelete(false);
          toast.push(t('data.resetDone'), 'success');
          navigate('/orders');
        }}
        title={t('action.delete')}
        body={t('data.consequences')}
        confirmLabel={t('action.delete')}
        cancelLabel={t('action.cancel')}
        typedPhrase="DELETE"
        typePrompt={t('data.typeToConfirm', { phrase: 'DELETE' })}
      />
    </>
  );
}

/* ------------------------------------------------------------------ *
 * Returns & damages tabs
 * ------------------------------------------------------------------ */

function ReturnsTab() {
  const { t } = useI18n();
  const fmt = useFmt();
  const { analytics, data, run } = useWorkspace();
  const toast = useToast();
  const [editing, setEditing] = useState<ReturnRecord | null>(null);

  if (!analytics) return null;
  const returns = analytics.period.returns;
  const economics = analytics.metrics.returns;

  return (
    <>
      <div className="card__body">
        <div className="grid grid--kpi mb-5">
          <div className="metric">
            <span className="metric__label">{t('returns.cashCost')}</span>
            <span className="metric__value metric__value--sm money-negative">{fmt.money(economics.cashCost)}</span>
          </div>
          <div className="metric">
            <span className="metric__label">{t('returns.recoveredStock')}</span>
            <span className="metric__value metric__value--sm money-positive">{fmt.money(economics.recoveredStockValue)}</span>
          </div>
          <div className="metric">
            <span className="metric__label">{t('returns.netImpact')}</span>
            <span className="metric__value metric__value--sm">{fmt.money(economics.netEconomicImpact)}</span>
          </div>
        </div>
        <p className="tiny muted mb-4">{t('returns.explain')}</p>
        <div className="mb-4">
          <Button variant="primary" icon={<IconPlus size={15} />} onClick={() => setEditing(emptyReturn())}>
            {t('returns.new')}
          </Button>
        </div>
        <DataTable
          columns={[
            { key: 'date', label: t('common.date'), render: (r: (typeof returns)[number]) => fmt.date(r.date), sortValue: (r) => r.date },
            { key: 'order', label: t('orders.orderNo'), render: (r) => <Link to={`/orders/${r.orderId}`}>{data?.orders.find((o) => o.id === r.orderId)?.orderNo ?? '—'}</Link>, sortValue: (r) => r.orderId },
            { key: 'product', label: t('nav.products'), render: (r) => data?.products.find((p) => p.id === r.productId)?.name ?? '—', sortValue: (r) => r.productId },
            { key: 'reason', label: t('returns.reason'), render: (r) => r.reason, sortValue: (r) => r.reason },
            { key: 'fee', label: t('returns.returnFee'), numeric: true, render: (r) => fmt.money(r.returnFee), sortValue: (r) => r.returnFee, hideOnMobile: true },
            { key: 'refund', label: t('returns.refund'), numeric: true, render: (r) => fmt.money(r.refund), sortValue: (r) => r.refund, hideOnMobile: true },
            { key: 'cond', label: t('returns.condition'), render: (r) => <Chip tone={r.resellable ? 'success' : 'danger'}>{t(`returns.condition.${r.condition}`)}</Chip>, sortValue: (r) => r.condition },
          ]}
          rows={returns}
          rowKey={(r) => r.id}
          onRowClick={(r) => setEditing(r)}
          empty={<EmptyState title={t('empty.returns.title')} body={t('empty.returns.body')} action={<Button variant="primary" onClick={() => setEditing(emptyReturn())}>{t('empty.returns.cta')}</Button>} />}
        />
      </div>

      {editing && (
        <ReturnForm
          record={editing}
          onClose={() => setEditing(null)}
          onSave={async (r) => {
            const product = data?.products.find((p) => p.id === r.productId);
            await run(() => saveReturn(r, product?.buyingPrice ?? 0));
            setEditing(null);
            toast.push(t('app.saved'), 'success');
          }}
        />
      )}
    </>
  );
}

export function ReturnForm({ record, onClose, onSave }: { record: ReturnRecord; onClose: () => void; onSave: (r: ReturnRecord) => Promise<void> }) {
  const { t } = useI18n();
  const { data } = useWorkspace();
  const [draft, setDraft] = useState<ReturnRecord>(record);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  return (
    <Modal
      open
      onClose={onClose}
      title={t('returns.new')}
      footer={
        <>
          <Button onClick={onClose}>{t('action.cancel')}</Button>
          <Button
            variant="primary"
            disabled={busy}
            onClick={async () => {
              if (!draft.orderId || !draft.productId) {
                toast.push(t('error.validation'), 'danger');
                return;
              }
              setBusy(true);
              try {
                await onSave(draft);
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
        <SelectInput
          label={t('orders.orderNo')}
          value={draft.orderId}
          onChange={(e) => {
            const order = data?.orders.find((o) => o.id === e.target.value);
            const firstItem = data?.orderItems.find((i) => i.orderId === e.target.value);
            setDraft({
              ...draft,
              orderId: e.target.value,
              courierId: order?.courierId ?? draft.courierId,
              productId: firstItem?.productId ?? draft.productId,
              qty: firstItem?.qty ?? draft.qty,
            });
          }}
          options={[{ value: '', label: '—' }, ...(data?.orders ?? []).slice(-200).reverse().map((o) => ({ value: o.id, label: `${o.orderNo} · ${o.date}` }))]}
        />
        <SelectInput label={t('nav.products')} value={draft.productId} onChange={(e) => setDraft({ ...draft, productId: e.target.value })} options={[{ value: '', label: '—' }, ...(data?.products ?? []).map((p) => ({ value: p.id, label: p.name }))]} />
        <TextInput label={t('common.qty')} value={String(draft.qty)} onChange={(e) => setDraft({ ...draft, qty: Number(e.target.value) || 0 })} />
        <TextInput label={t('common.date')} type="date" value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} />
        <SelectInput label={t('returns.reason')} value={draft.reason} onChange={(e) => setDraft({ ...draft, reason: e.target.value })} options={RETURN_REASONS.map((r) => ({ value: r, label: r }))} />
        <SelectInput label={t('returns.condition')} value={draft.condition} onChange={(e) => { const v = e.target.value as ReturnRecord['condition']; setDraft({ ...draft, condition: v, resellable: v === 'resellable' }); }} options={[{ value: 'resellable', label: t('returns.condition.resellable') }, { value: 'damaged', label: t('returns.condition.damaged') }, { value: 'lost', label: t('returns.condition.lost') }]} />
        <TextInput label={t('returns.returnFee')} money value={String(toMajor(draft.returnFee))} onChange={(e) => setDraft({ ...draft, returnFee: money(e.target.value) })} />
        <TextInput label={t('returns.refund')} money value={String(toMajor(draft.refund))} onChange={(e) => setDraft({ ...draft, refund: money(e.target.value) })} />
        <TextInput label={t('returns.packagingLoss')} money value={String(toMajor(draft.packagingLoss))} onChange={(e) => setDraft({ ...draft, packagingLoss: money(e.target.value) })} />
        <TextInput label={t('returns.adAllocation')} money value={String(toMajor(draft.adAllocation))} onChange={(e) => setDraft({ ...draft, adAllocation: money(e.target.value) })} />
      </div>
      <p className="field__help mt-4">{t('returns.explain')}</p>
    </Modal>
  );
}

function DamagesTab() {
  const { t } = useI18n();
  const fmt = useFmt();
  const { data, analytics, run } = useWorkspace();
  const toast = useToast();
  const [editing, setEditing] = useState<DamageDraft | null>(null);

  if (!analytics || !data) return null;
  const damages = data.damages.filter((d) => d.date >= analytics.range.start && d.date <= analytics.range.end);

  return (
    <>
      <div className="card__body">
        <div className="mb-4">
          <Button variant="primary" icon={<IconPlus size={15} />} onClick={() => setEditing({ id: '', productId: '', qty: 1, date: analytics.range.end, reason: '', unitCost: 0, recoverable: false, recoveredAmount: 0, note: '' })}>
            {t('damages.new')}
          </Button>
        </div>
        <DataTable
          columns={[
            { key: 'date', label: t('common.date'), render: (d: (typeof damages)[number]) => fmt.date(d.date), sortValue: (d) => d.date },
            { key: 'product', label: t('nav.products'), render: (d) => data.products.find((p) => p.id === d.productId)?.name ?? '—', sortValue: (d) => d.productId },
            { key: 'qty', label: t('common.qty'), numeric: true, render: (d) => fmt.num(d.qty), sortValue: (d) => d.qty },
            { key: 'reason', label: t('damages.reason'), render: (d) => d.reason, sortValue: (d) => d.reason },
            { key: 'cost', label: t('damages.writeoff'), numeric: true, render: (d) => fmt.money(roundMinor(d.unitCost * d.qty)), sortValue: (d) => d.unitCost * d.qty },
            { key: 'rec', label: t('damages.recovered'), numeric: true, render: (d) => fmt.money(d.recoveredAmount), sortValue: (d) => d.recoveredAmount, hideOnMobile: true },
          ]}
          rows={damages}
          rowKey={(d) => d.id}
          empty={<EmptyState title={t('common.noData')} body={t('empty.inventory.body')} />}
        />
      </div>

      {editing && (
        <Modal
          open
          onClose={() => setEditing(null)}
          size="sm"
          title={t('damages.new')}
          footer={
            <>
              <Button onClick={() => setEditing(null)}>{t('action.cancel')}</Button>
              <Button
                variant="primary"
                onClick={async () => {
                  const product = data.products.find((p) => p.id === editing.productId);
                  const { saveDamage, emptyDamage } = await import('../state/mutations');
                  await run(() =>
                    saveDamage({
                      ...emptyDamage(),
                      ...editing,
                      id: editing.id || emptyDamage().id,
                      unitCost: editing.unitCost || product?.buyingPrice || 0,
                    }),
                  );
                  setEditing(null);
                  toast.push(t('app.saved'), 'success');
                }}
              >
                {t('action.save')}
              </Button>
            </>
          }
        >
          <div className="stack">
            <SelectInput label={t('nav.products')} value={editing.productId} onChange={(e) => setEditing({ ...editing, productId: e.target.value })} options={[{ value: '', label: '—' }, ...data.products.map((p) => ({ value: p.id, label: p.name }))]} />
            <TextInput label={t('common.qty')} value={String(editing.qty)} onChange={(e) => setEditing({ ...editing, qty: Number(e.target.value) || 0 })} />
            <TextInput label={t('common.date')} type="date" value={editing.date} onChange={(e) => setEditing({ ...editing, date: e.target.value })} />
            <TextInput label={t('damages.reason')} value={editing.reason} onChange={(e) => setEditing({ ...editing, reason: e.target.value })} />
            <TextInput label={t('damages.recovered')} money value={String(toMajor(editing.recoveredAmount))} onChange={(e) => setEditing({ ...editing, recoveredAmount: money(e.target.value) })} />
          </div>
        </Modal>
      )}
    </>
  );
}

interface DamageDraft {
  id: string;
  productId: string;
  qty: number;
  date: string;
  reason: string;
  unitCost: Money;
  recoverable: boolean;
  recoveredAmount: Money;
  note: string;
}
