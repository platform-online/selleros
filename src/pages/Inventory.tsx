import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useI18n } from '../i18n';
import { useWorkspace } from '../state/workspace';
import { useFmt } from '../state/format';
import { PageHeader } from '../components/layout/PageHeader';
import { PeriodPicker } from '../components/layout/PeriodPicker';
import { Button, Card, Chip, EmptyState, KeyValue, Modal, SelectInput, TextInput, useToast, Field } from '../components/ui/primitives';
import { DataTable, type Column } from '../components/ui/DataTable';
import { DonutChart, HorizontalBarChart } from '../components/charts/Charts';
import { addMovement, emptyPurchase, savePurchase, type PurchaseLine } from '../state/mutations';
import { money, roundMinor, toMajor, type Money } from '../lib/money';
import type { MovementType, Purchase } from '../domain/types';
import { IconPlus, IconWarehouse } from '../components/ui/icons';

export function InventoryPage() {
  const { t } = useI18n();
  const fmt = useFmt();
  const { analytics, loading, data, run } = useWorkspace();
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState<'stock' | 'movements' | 'purchases'>('stock');
  const [filter, setFilter] = useState('all');
  const [adjust, setAdjust] = useState<{ productId: string; qty: string; type: MovementType; note: string; date: string } | null>(null);
  const [purchaseDraft, setPurchaseDraft] = useState<Purchase | null>(null);

  useEffect(() => {
    if (params.get('newPurchase') === '1') {
      setPurchaseDraft(emptyPurchase());
      setParams({}, { replace: true });
    }
  }, [params, setParams]);

  if (loading || !analytics) return <Card><p className="muted small">{t('common.loading')}</p></Card>;

  const inv = analytics.inventory;
  const rows = inv.rows.filter((r) => (filter === 'all' ? true : r.state === filter));

  const columns: Column<(typeof rows)[number]>[] = [
    { key: 'name', label: t('products.field.name'), render: (r) => <Link to={`/products/${r.product.id}`}>{r.product.name}</Link>, sortValue: (r) => r.product.name },
    { key: 'sku', label: t('products.field.sku'), render: (r) => r.product.sku, sortValue: (r) => r.product.sku, hideOnMobile: true },
    { key: 'onHand', label: t('inventory.onHand'), numeric: true, render: (r) => fmt.num(r.onHand), sortValue: (r) => r.onHand },
    { key: 'reserved', label: t('inventory.reserved'), numeric: true, render: (r) => fmt.num(r.reserved), sortValue: (r) => r.reserved, hideOnMobile: true },
    { key: 'available', label: t('inventory.available'), numeric: true, render: (r) => fmt.num(r.available), sortValue: (r) => r.available },
    { key: 'value', label: t('inventory.value'), numeric: true, render: (r) => fmt.money(r.value), sortValue: (r) => r.value },
    { key: 'sold', label: t('common.units'), numeric: true, render: (r) => fmt.num(r.unitsSold), sortValue: (r) => r.unitsSold, hideOnMobile: true },
    { key: 'turnover', label: t('inventory.turnover'), numeric: true, render: (r) => (r.turnover === null ? '—' : fmt.num(r.turnover, 2)), sortValue: (r) => r.turnover ?? -1, hideOnMobile: true },
    { key: 'days', label: t('inventory.daysOfStock'), numeric: true, render: (r) => (r.daysLeft === null ? '—' : fmt.num(r.daysLeft, 0)), sortValue: (r) => r.daysLeft ?? -1 },
    {
      key: 'state',
      label: t('common.status'),
      render: (r) => (
        <Chip tone={r.state === 'out' || r.state === 'critical' ? 'danger' : r.state === 'low' ? 'warning' : r.state === 'dead' || r.state === 'slow' ? 'neutral' : r.state === 'overstock' ? 'info' : 'success'} dot>
          {t(`status.${r.state === 'out' ? 'outOfStock' : r.state === 'critical' ? 'critical' : r.state === 'low' ? 'lowStock' : r.state === 'dead' ? 'dead' : r.state === 'slow' ? 'slow' : r.state === 'overstock' ? 'overstock' : 'healthy'}`)}
        </Chip>
      ),
      sortValue: (r) => r.state,
    },
    {
      key: 'act',
      label: t('common.actions'),
      render: (r) => (
        <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); setAdjust({ productId: r.product.id, qty: '0', type: 'adjustment', note: '', date: analytics.range.end }); }}>
          {t('inventory.addMovement')}
        </Button>
      ),
      sortValue: (r) => r.product.id,
    },
  ];

  const stateDonut = (() => {
    const counts: Record<string, number> = {};
    for (const r of inv.rows) counts[r.state] = (counts[r.state] ?? 0) + 1;
    return Object.entries(counts).map(([label, value]) => ({ label, value }));
  })();

  const valueBars = inv.rows
    .filter((r) => r.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 8)
    .map((r) => ({ id: r.product.id, label: r.product.name.length > 18 ? `${r.product.name.slice(0, 17)}…` : r.product.name, value: r.value / 100 }));

  const movements = [...(data?.movements ?? [])]
    .filter((m) => m.date >= analytics.range.start && m.date <= analytics.range.end)
    .sort((a, b) => (a.date < b.date ? 1 : -1));

  const purchases = (data?.purchases ?? [])
    .filter((p) => p.date >= analytics.range.start && p.date <= analytics.range.end)
    .sort((a, b) => (a.date < b.date ? 1 : -1));

  return (
    <>
      <PageHeader
        title={t('inventory.title')}
        subtitle={`${fmt.money(inv.totalValue)} · ${fmt.num(inv.totalUnits)} ${t('common.units')}`}
        actions={
          <>
            <Button variant="secondary" onClick={() => setPurchaseDraft(emptyPurchase())}>
              {t('purchases.new')}
            </Button>
            <Button variant="primary" icon={<IconPlus size={15} />} onClick={() => setAdjust({ productId: data?.products[0]?.id ?? '', qty: '0', type: 'adjustment', note: '', date: analytics.range.end })}>
              {t('inventory.addMovement')}
            </Button>
          </>
        }
      >
        <div className="mt-4">
          <PeriodPicker />
        </div>
      </PageHeader>

      <div className="grid grid--kpi mb-5">
        {[
          { label: t('kpi.inventoryValue'), value: fmt.money(inv.totalValue) },
          { label: t('inventory.deadStockValue'), value: fmt.money(inv.deadStockValue) },
          { label: t('inventory.slowStockValue'), value: fmt.money(inv.slowStockValue) },
          { label: t('inventory.overstockValue'), value: fmt.money(inv.overstockValue) },
          { label: t('inventory.turnover'), value: inv.averageTurnover === null ? '—' : fmt.num(inv.averageTurnover, 2) },
          { label: t('widget.stockoutRisk'), value: fmt.num(inv.stockoutRisk.length) },
        ].map((k) => (
          <div className="metric" key={k.label}>
            <span className="metric__label">{k.label}</span>
            <span className="metric__value metric__value--sm">{k.value}</span>
          </div>
        ))}
      </div>

      <Card className="mb-5" flush>
        <div className="card__body" style={{ paddingBottom: 0 }}>
          <div className="tabs" role="tablist" aria-label={t('inventory.title')}>
            {(['stock', 'movements', 'purchases'] as const).map((key) => (
              <button key={key} type="button" role="tab" className="tab" aria-selected={tab === key} onClick={() => setTab(key)}>
                {key === 'stock' ? t('inventory.onHand') : key === 'movements' ? t('inventory.movements') : t('purchases.title')}
              </button>
            ))}
          </div>
        </div>

        {tab === 'stock' && (
          <div role="tabpanel" tabIndex={-1}>
            <div className="card__body">
              <div className="row gap-3 mb-4">
                <SelectInput
                  aria-label={t('common.filter')}
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  options={[
                    { value: 'all', label: t('common.all') },
                    { value: 'out', label: t('status.outOfStock') },
                    { value: 'critical', label: t('status.critical') },
                    { value: 'low', label: t('status.lowStock') },
                    { value: 'healthy', label: t('status.healthy') },
                    { value: 'slow', label: t('status.slow') },
                    { value: 'dead', label: t('status.dead') },
                    { value: 'overstock', label: t('status.overstock') },
                  ]}
                />
              </div>
              <div className="grid grid--2 mb-5">
                <div>
                  <h4 className="mb-4">{t('inventory.value')}</h4>
                  <HorizontalBarChart data={valueBars} lang={fmt.lang} currency={fmt.currency} />
                </div>
                <div>
                  <h4 className="mb-4">{t('common.status')}</h4>
                  <DonutChart data={stateDonut} lang={fmt.lang} currency={fmt.currency} format="number" />
                </div>
              </div>
            </div>
            {rows.length === 0 ? (
              <EmptyState icon={<IconWarehouse size={20} />} title={t('empty.inventory.title')} body={t('empty.inventory.body')} />
            ) : (
              <DataTable columns={columns} rows={rows} rowKey={(r) => r.product.id} caption={t('inventory.title')} />
            )}
          </div>
        )}

        {tab === 'movements' && (
          <div role="tabpanel" tabIndex={-1}>
            <DataTable
              columns={[
                { key: 'date', label: t('common.date'), render: (m: (typeof movements)[number]) => fmt.date(m.date), sortValue: (m) => m.date },
                { key: 'product', label: t('nav.products'), render: (m) => data?.products.find((p) => p.id === m.productId)?.name ?? '—', sortValue: (m) => m.productId },
                { key: 'type', label: t('common.type'), render: (m) => <Chip tone={m.qty >= 0 ? 'success' : 'neutral'}>{t(`inventory.movement.${m.type}`)}</Chip>, sortValue: (m) => m.type },
                { key: 'qty', label: t('common.qty'), numeric: true, render: (m) => fmt.num(m.qty), sortValue: (m) => m.qty },
                { key: 'cost', label: t('common.cost'), numeric: true, render: (m) => (m.unitCost === null ? '—' : fmt.money(m.unitCost)), sortValue: (m) => m.unitCost ?? 0, hideOnMobile: true },
                { key: 'note', label: t('common.notes'), render: (m) => m.note || '—', sortValue: (m) => m.note, hideOnMobile: true },
              ]}
              rows={movements}
              rowKey={(m) => m.id}
              empty={<EmptyState title={t('empty.inventory.title')} body={t('empty.inventory.body')} />}
            />
          </div>
        )}

        {tab === 'purchases' && (
          <div role="tabpanel" tabIndex={-1}>
            <DataTable
              columns={[
                { key: 'ref', label: t('purchases.ref'), render: (p: (typeof purchases)[number]) => p.ref, sortValue: (p) => p.ref },
                { key: 'date', label: t('common.date'), render: (p) => fmt.date(p.date), sortValue: (p) => p.date },
                { key: 'supplier', label: t('nav.suppliers'), render: (p) => data?.suppliers.find((s) => s.id === p.supplierId)?.name ?? '—', sortValue: (p) => p.supplierId },
                { key: 'status', label: t('common.status'), render: (p) => <Chip tone="outline">{t(`status.${p.status}`)}</Chip>, sortValue: (p) => p.status },
                { key: 'paid', label: t('status.paid'), numeric: true, render: (p) => fmt.money(p.payments.reduce((a, x) => a + x.amount, 0)), sortValue: (p) => p.payments.reduce((a, x) => a + x.amount, 0) },
                {
                  key: 'outstanding',
                  label: t('purchases.outstanding'),
                  numeric: true,
                  render: (p) => {
                    const items = (data?.purchaseItems ?? []).filter((i) => i.purchaseId === p.id);
                    const goods = items.reduce((a, i) => a + roundMinor(i.buyingPrice * i.receivedQty), 0);
                    const paid = p.payments.reduce((a, x) => a + x.amount, 0);
                    return fmt.money(goods - paid);
                  },
                  sortValue: (p) => {
                    const items = (data?.purchaseItems ?? []).filter((i) => i.purchaseId === p.id);
                    return items.reduce((a, i) => a + roundMinor(i.buyingPrice * i.receivedQty), 0) - p.payments.reduce((a, x) => a + x.amount, 0);
                  },
                },
                {
                  key: 'act',
                  label: t('common.actions'),
                  render: (p) => (
                    <Button size="sm" variant="ghost" onClick={() => setPurchaseDraft(p)}>
                      {t('action.edit')}
                    </Button>
                  ),
                  sortValue: (p) => p.id,
                },
              ]}
              rows={purchases}
              rowKey={(p) => p.id}
              empty={<EmptyState title={t('empty.purchases.title')} body={t('empty.purchases.body')} action={<Button variant="primary" onClick={() => setPurchaseDraft(emptyPurchase())}>{t('empty.purchases.cta')}</Button>} />}
            />
          </div>
        )}
      </Card>

      {adjust && (
        <AdjustModal
          initial={adjust}
          onClose={() => setAdjust(null)}
          onSave={async (payload) => {
            await run(() =>
              addMovement({
                productId: payload.productId,
                type: payload.type,
                qty: payload.qty,
                date: payload.date,
                unitCost: data?.products.find((p) => p.id === payload.productId)?.buyingPrice ?? null,
                refType: null,
                refId: null,
                note: payload.note,
              }),
            );
            setAdjust(null);
          }}
        />
      )}

      {purchaseDraft && (
        <PurchaseForm
          purchase={purchaseDraft}
          onClose={() => setPurchaseDraft(null)}
          onSave={async (p, lines) => {
            await run(() => savePurchase(p, lines));
            setPurchaseDraft(null);
          }}
        />
      )}
    </>
  );
}

/* ------------------------------------------------------------------ *
 * Stock adjustment
 * ------------------------------------------------------------------ */

function AdjustModal({
  initial,
  onClose,
  onSave,
}: {
  initial: { productId: string; qty: string; type: MovementType; note: string; date: string };
  onClose: () => void;
  onSave: (payload: { productId: string; qty: number; type: MovementType; note: string; date: string }) => Promise<void>;
}) {
  const { t } = useI18n();
  const { data } = useWorkspace();
  const toast = useToast();
  const [form, setForm] = useState(initial);

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={t('inventory.addMovement')}
      footer={
        <>
          <Button onClick={onClose}>{t('action.cancel')}</Button>
          <Button
            variant="primary"
            onClick={async () => {
              const qty = Number(form.qty) || 0;
              if (!form.productId || qty === 0) {
                toast.push(t('error.validation'), 'danger');
                return;
              }
              await onSave({ ...form, qty });
              toast.push(t('app.saved'), 'success');
            }}
          >
            {t('action.save')}
          </Button>
        </>
      }
    >
      <div className="stack">
        <SelectInput label={t('nav.products')} value={form.productId} onChange={(e) => setForm({ ...form, productId: e.target.value })} options={(data?.products ?? []).map((p) => ({ value: p.id, label: `${p.name} (${p.sku})` }))} />
        <SelectInput
          label={t('common.type')}
          value={form.type}
          onChange={(e) => setForm({ ...form, type: e.target.value as MovementType })}
          options={[
            { value: 'adjustment', label: t('inventory.movement.adjustment') },
            { value: 'correction', label: t('inventory.movement.correction') },
            { value: 'transfer', label: t('inventory.movement.transfer') },
          ]}
        />
        <TextInput label={t('common.qty')} value={form.qty} help={t('products.help.openingStock')} onChange={(e) => setForm({ ...form, qty: e.target.value })} />
        <TextInput label={t('common.date')} type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
        <Field label={t('common.notes')}>
          <input className="input" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
        </Field>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ *
 * Purchase form
 * ------------------------------------------------------------------ */

export function PurchaseForm({ purchase, onClose, onSave }: { purchase: Purchase; onClose: () => void; onSave: (p: Purchase, lines: PurchaseLine[]) => Promise<void> }) {
  const { t } = useI18n();
  const fmt = useFmt();
  const { data } = useWorkspace();
  const toast = useToast();
  const [draft, setDraft] = useState<Purchase>(purchase);
  const [lines, setLines] = useState<PurchaseLine[]>(() =>
    (data?.purchaseItems ?? [])
      .filter((i) => i.purchaseId === purchase.id)
      .map((i) => ({ productId: i.productId, qty: i.qty, receivedQty: i.receivedQty, buyingPrice: i.buyingPrice })),
  );
  const [payAmount, setPayAmount] = useState<Money>(0);
  const [payDate, setPayDate] = useState(purchase.date);
  const [payMethod, setPayMethod] = useState('Bank');

  const products = data?.products ?? [];
  const goods = lines.reduce((a, l) => a + roundMinor(l.buyingPrice * l.qty), 0);
  const additional = Object.values(draft.additionalCosts).reduce((a, v) => a + v, 0);

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={purchase.ref ? t('action.edit') : t('purchases.new')}
      subtitle={draft.ref}
      footer={
        <>
          <Button onClick={onClose}>{t('action.cancel')}</Button>
          <Button
            variant="primary"
            onClick={async () => {
              const valid = lines.filter((l) => l.productId && l.qty > 0);
              if (valid.length === 0) {
                toast.push(t('error.validation'), 'danger');
                return;
              }
              const next = { ...draft };
              if (payAmount > 0) {
                next.payments = [...draft.payments, { id: `pp_${Date.now()}`, date: payDate, amount: payAmount, method: payMethod }];
              }
              if (next.status === 'ordered' && valid.every((l) => l.receivedQty >= l.qty) && valid.some((l) => l.receivedQty > 0)) {
                next.status = 'received';
                next.receivedDate = next.receivedDate ?? next.date;
              } else if (valid.some((l) => l.receivedQty > 0)) {
                next.status = 'partial';
              }
              await onSave(next, valid);
              toast.push(t('app.saved'), 'success');
            }}
          >
            {t('action.save')}
          </Button>
        </>
      }
    >
      <div className="stack">
        <div className="row gap-3">
          <TextInput label={t('purchases.ref')} value={draft.ref} onChange={(e) => setDraft({ ...draft, ref: e.target.value })} />
          <SelectInput label={t('nav.suppliers')} value={draft.supplierId ?? ''} onChange={(e) => setDraft({ ...draft, supplierId: e.target.value || null })} options={[{ value: '', label: '—' }, ...(data?.suppliers ?? []).map((s) => ({ value: s.id, label: s.name }))]} />
          <TextInput label={t('common.date')} type="date" value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} />
          <TextInput label={t('purchases.expectedDate')} type="date" value={draft.expectedDate ?? ''} onChange={(e) => setDraft({ ...draft, expectedDate: e.target.value || null })} />
          <TextInput label={t('purchases.receivedDate')} type="date" value={draft.receivedDate ?? ''} onChange={(e) => setDraft({ ...draft, receivedDate: e.target.value || null })} />
          <SelectInput label={t('common.status')} value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value as Purchase['status'] })} options={[{ value: 'draft', label: t('status.draft') }, { value: 'ordered', label: t('status.ordered') }, { value: 'partial', label: t('status.partial') }, { value: 'received', label: t('status.received') }, { value: 'cancelled', label: t('status.cancelled') }]} />
        </div>

        <h4 className="mt-4">{t('purchases.items')}</h4>
        {lines.map((line, index) => (
          <div key={index} className="row gap-2" style={{ alignItems: 'flex-end' }}>
            <div style={{ flex: '2 1 200px', minWidth: 160 }}>
              <SelectInput
                aria-label={t('nav.products')}
                value={line.productId}
                onChange={(e) => {
                  const p = products.find((x) => x.id === e.target.value);
                  setLines((prev) => prev.map((l, i) => (i === index ? { ...l, productId: e.target.value, buyingPrice: p?.buyingPrice ?? l.buyingPrice } : l)));
                }}
                options={[{ value: '', label: '—' }, ...products.map((p) => ({ value: p.id, label: p.name }))]}
              />
            </div>
            <div style={{ flex: '0 0 80px' }}>
              <TextInput aria-label={t('common.qty')} value={String(line.qty)} onChange={(e) => setLines((prev) => prev.map((l, i) => (i === index ? { ...l, qty: Number(e.target.value) || 0 } : l)))} />
            </div>
            <div style={{ flex: '0 0 90px' }}>
              <TextInput aria-label={t('purchases.received')} value={String(line.receivedQty)} onChange={(e) => setLines((prev) => prev.map((l, i) => (i === index ? { ...l, receivedQty: Number(e.target.value) || 0 } : l)))} />
            </div>
            <div style={{ flex: '1 1 110px' }}>
              <TextInput aria-label={t('products.field.buyingPrice')} money value={String(toMajor(line.buyingPrice))} onChange={(e) => setLines((prev) => prev.map((l, i) => (i === index ? { ...l, buyingPrice: money(e.target.value) } : l)))} />
            </div>
            <Button size="sm" variant="ghost" aria-label={t('action.remove')} onClick={() => setLines((prev) => prev.filter((_, i) => i !== index))}>
              ✕
            </Button>
          </div>
        ))}
        <Button size="sm" variant="secondary" onClick={() => setLines((prev) => [...prev, { productId: '', qty: 1, receivedQty: 0, buyingPrice: 0 }])}>
          {t('action.add')}
        </Button>

        <h4 className="mt-5">{t('purchases.additionalCosts')}</h4>
        <div className="row gap-3">
          {(['importDuty', 'freight', 'customs', 'handling', 'packaging', 'label', 'other'] as const).map((key) => (
            <div key={key} style={{ flex: '1 1 120px' }}>
              <TextInput
                label={t(`products.cost.${key}`)}
                money
                value={String(toMajor(draft.additionalCosts[key]))}
                onChange={(e) => setDraft({ ...draft, additionalCosts: { ...draft.additionalCosts, [key]: money(e.target.value) } })}
              />
            </div>
          ))}
        </div>

        <KeyValue
          className="mt-4"
          tight
          rows={[
            { label: t('purchases.items'), value: fmt.money(goods) },
            { label: t('purchases.additionalCosts'), value: fmt.money(additional) },
            { label: t('products.cost.landed'), value: fmt.money(goods + additional), total: true, divider: true },
            { label: t('purchases.landedUnitCost'), value: lines.reduce((a, l) => a + l.receivedQty, 0) > 0 ? fmt.money(Math.round((goods + additional) / lines.reduce((a, l) => a + l.receivedQty, 0))) : '—' },
          ]}
        />

        <h4 className="mt-5">{t('purchases.recordPayment')}</h4>
        <div className="row gap-3">
          <TextInput label={t('common.amount')} money value={String(toMajor(payAmount))} onChange={(e) => setPayAmount(money(e.target.value))} />
          <TextInput label={t('common.date')} type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} />
          <SelectInput label={t('expenses.method')} value={payMethod} onChange={(e) => setPayMethod(e.target.value)} options={(data?.settings.paymentMethods ?? []).map((m) => ({ value: m, label: m }))} />
        </div>
        <p className="field__help mt-2">{t('purchases.outstanding')}: {fmt.money(Math.max(0, goods + additional - draft.payments.reduce((a, x) => a + x.amount, 0) - payAmount))}</p>
      </div>
    </Modal>
  );
}
