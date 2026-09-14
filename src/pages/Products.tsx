import { useMemo, useState, useEffect } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useI18n } from '../i18n';
import { useWorkspace } from '../state/workspace';
import { useFmt } from '../state/format';
import { PageHeader } from '../components/layout/PageHeader';
import { PeriodPicker } from '../components/layout/PeriodPicker';
import {
  Bar,
  Button,
  Card,
  Chip,
  ConfirmDialog,
  EmptyState,
  Field,
  KeyValue,
  Modal,
  SelectInput,
  TextInput,
  useToast,
} from '../components/ui/primitives';
import { DataTable, type Column } from '../components/ui/DataTable';
import { HorizontalBarChart } from '../components/charts/Charts';
import { money, toMajor, type Money } from '../lib/money';
import { costBreakdown, directCostPerUnit, landedCost, trueUnitCost, DIRECT_COST_KEYS } from '../domain/finance';
import {
  deleteProduct,
  emptyProduct,
  saveProduct,
  validateProduct,
  type ProductValidation,
} from '../state/mutations';
import type { Product } from '../domain/types';
import { IconBox, IconPlus } from '../components/ui/icons';

export function ProductsPage() {
  const { t } = useI18n();
  const fmt = useFmt();
  const { analytics, loading, run } = useWorkspace();
  const [params] = useSearchParams();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [status, setStatus] = useState('all');
  const [editing, setEditing] = useState<Product | null>(null);
  const [openingStock, setOpeningStock] = useState<number | null>(null);

  useEffect(() => {
    if (params.get('new') === '1') {
      setEditing(emptyProduct());
      setOpeningStock(0);
    }
  }, [params]);

  if (loading || !analytics) return <Card><p className="muted small">{t('common.loading')}</p></Card>;

  const products = analytics.products;
  const categories = [...new Set(products.map((p) => p.product.category).filter(Boolean))];

  const rows = products.filter((p) => {
    const q = query.trim().toLowerCase();
    if (q && !`${p.product.name} ${p.product.sku} ${p.product.brand}`.toLowerCase().includes(q)) return false;
    if (category !== 'all' && p.product.category !== category) return false;
    if (status !== 'all' && p.product.status !== status) return false;
    return true;
  });

  const columns: Column<(typeof rows)[number]>[] = [
    {
      key: 'name',
      label: t('products.field.name'),
      render: (r) => (
        <Link to={`/products/${r.product.id}`} style={{ fontWeight: 500 }}>
          {r.product.name}
        </Link>
      ),
      sortValue: (r) => r.product.name,
    },
    { key: 'sku', label: t('products.field.sku'), render: (r) => r.product.sku, sortValue: (r) => r.product.sku },
    { key: 'category', label: t('common.category'), render: (r) => r.product.category || '—', sortValue: (r) => r.product.category, hideOnMobile: true },
    {
      key: 'price',
      label: t('products.field.sellingPrice'),
      numeric: true,
      render: (r) => fmt.money(r.product.sellingPrice),
      sortValue: (r) => r.product.sellingPrice,
    },
    {
      key: 'cost',
      label: t('products.cost.trueUnit'),
      numeric: true,
      render: (r) => fmt.money(r.trueUnitCost),
      sortValue: (r) => r.trueUnitCost,
      hideOnMobile: true,
    },
    {
      key: 'margin',
      label: t('common.margin'),
      numeric: true,
      render: (r) => fmt.pct(r.grossMarginPct),
      sortValue: (r) => r.grossMarginPct ?? -1,
    },
    { key: 'stock', label: t('inventory.onHand'), numeric: true, render: (r) => fmt.num(r.stock), sortValue: (r) => r.stock },
    {
      key: 'status',
      label: t('common.status'),
      render: (r) => {
        const state = analytics.inventory.rows.find((x) => x.product.id === r.product.id)?.state;
        return (
          <Chip tone={state === 'out' ? 'danger' : state === 'critical' || state === 'low' ? 'warning' : state === 'dead' ? 'neutral' : 'success'} dot>
            {state === 'out'
              ? t('status.outOfStock')
              : state === 'critical'
                ? t('status.critical')
                : state === 'low'
                  ? t('status.lowStock')
                  : state === 'dead'
                    ? t('status.dead')
                    : state === 'slow'
                      ? t('status.slow')
                      : state === 'overstock'
                        ? t('status.overstock')
                        : t('status.inStock')}
          </Chip>
        );
      },
      sortValue: (r) => analytics.inventory.rows.find((x) => x.product.id === r.product.id)?.onHand ?? 0,
    },
    {
      key: 'profit',
      label: t('common.profit'),
      numeric: true,
      render: (r) => (
        <span style={{ color: r.contributionProfit < 0 ? 'var(--fin-loss)' : 'var(--fin-profit)' }}>
          {fmt.money(r.contributionProfit)}
        </span>
      ),
      sortValue: (r) => r.contributionProfit,
    },
  ];

  return (
    <>
      <PageHeader
        title={t('products.title')}
        subtitle={`${fmt.num(products.length)} · ${fmt.money(analytics.metrics.pl.cogs)} ${t('kpi.cogs').toLowerCase()}`}
        actions={
          <Button
            variant="primary"
            icon={<IconPlus size={15} />}
            onClick={() => {
              setEditing(emptyProduct());
              setOpeningStock(0);
            }}
          >
            {t('products.new')}
          </Button>
        }
      >
        <div className="mt-4">
          <PeriodPicker />
        </div>
      </PageHeader>

      <Card className="mb-5">
        <div className="row gap-3">
          <TextInput
            placeholder={t('common.search')}
            aria-label={t('common.search')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{ maxWidth: 280 }}
          />
          <SelectInput
            aria-label={t('common.category')}
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            options={[{ value: 'all', label: t('common.all') }, ...categories.map((c) => ({ value: c, label: c }))]}
          />
          <SelectInput
            aria-label={t('common.status')}
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            options={[
              { value: 'all', label: t('common.all') },
              { value: 'active', label: t('status.active') },
              { value: 'inactive', label: t('status.inactive') },
              { value: 'draft', label: t('status.draft') },
              { value: 'archived', label: t('status.archived') },
            ]}
          />
          {(query || category !== 'all' || status !== 'all') && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setQuery('');
                setCategory('all');
                setStatus('all');
              }}
            >
              {t('empty.tableClear')}
            </Button>
          )}
        </div>
      </Card>

      <Card flush>
        {rows.length === 0 ? (
          <EmptyState
            icon={<IconBox size={20} />}
            title={t('empty.products.title')}
            body={t('empty.products.body')}
            action={
              <Button
                variant="primary"
                onClick={() => {
                  setEditing(emptyProduct());
                  setOpeningStock(0);
                }}
              >
                {t('empty.products.cta')}
              </Button>
            }
          />
        ) : (
          <DataTable
            columns={columns}
            rows={rows}
            rowKey={(r) => r.product.id}
            onRowClick={(r) => {
              setEditing(r.product);
              setOpeningStock(null);
            }}
            caption={t('products.title')}
          />
        )}
      </Card>

      {editing && (
        <ProductForm
          product={editing}
          openingStock={openingStock}
          onClose={() => {
            setEditing(null);
            setOpeningStock(null);
          }}
          onSave={async (p, opening) => {
            await run(() => saveProduct(p, opening));
            setEditing(null);
            setOpeningStock(null);
          }}
        />
      )}
    </>
  );
}

/* ------------------------------------------------------------------ *
 * Product form
 * ------------------------------------------------------------------ */

export function ProductForm({
  product,
  openingStock,
  onClose,
  onSave,
}: {
  product: Product;
  openingStock: number | null;
  onClose: () => void;
  onSave: (product: Product, openingStock: number | null) => Promise<void>;
}) {
  const { t } = useI18n();
  const fmt = useFmt();
  const { data, settings } = useWorkspace();
  const toast = useToast();
  const [draft, setDraft] = useState<Product>(product);
  const [opening, setOpening] = useState<number>(openingStock ?? 0);
  const [errors, setErrors] = useState<ProductValidation>({});
  const [busy, setBusy] = useState(false);

  const existingStock = useMemo(() => {
    if (openingStock !== null) return null;
    return (data?.movements ?? [])
      .filter((m) => m.productId === product.id)
      .reduce((acc, m) => acc + m.qty, 0);
  }, [data?.movements, product.id, openingStock]);

  const isNew = openingStock !== null;
  const landed = landedCost(draft);
  const trueCost = trueUnitCost(draft);
  const grossProfit = draft.sellingPrice - trueCost;
  const margin = draft.sellingPrice > 0 ? (grossProfit / draft.sellingPrice) * 100 : null;
  const directPerUnit = directCostPerUnit(draft);

  const set = <K extends keyof Product>(key: K, value: Product[K]) => setDraft((d) => ({ ...d, [key]: value }));
  const setCost = (key: keyof Product['costs'], value: Money) =>
    setDraft((d) => ({ ...d, costs: { ...d.costs, [key]: value } }));

  const submit = async () => {
    const nextErrors = validateProduct(
      draft,
      (data?.products ?? []).filter((p) => p.id !== draft.id),
      { required: t('import.error.required'), duplicateSku: t('import.error.duplicateSku'), negative: t('import.error.negativeValue') },
    );
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      toast.push(t('error.validation'), 'danger');
      return;
    }
    setBusy(true);
    try {
      await onSave({ ...draft, sku: draft.sku.trim() }, isNew ? opening : null);
      toast.push(t('app.saved'), 'success');
    } finally {
      setBusy(false);
    }
  };

  const major = (v: Money) => String(toMajor(v));
  const onMoney = (v: string) => money(v);

  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      title={isNew ? t('products.new') : t('products.edit')}
      subtitle={draft.name || t('products.field.name')}
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
          <div className="form-section__head">{t('products.section.basic')}</div>
          <div className="form-section__body">
            <TextInput
              label={t('products.field.name')}
              required
              value={draft.name}
              error={errors.name}
              onChange={(e) => set('name', e.target.value)}
            />
            <TextInput label={t('products.field.sku')} required value={draft.sku} error={errors.sku} onChange={(e) => set('sku', e.target.value)} />
            <TextInput label={t('products.field.barcode')} value={draft.barcode} onChange={(e) => set('barcode', e.target.value)} />
            <SelectInput
              label={t('common.category')}
              value={draft.category}
              onChange={(e) => set('category', e.target.value)}
              options={[{ value: '', label: '—' }, ...(settings?.productCategories ?? []).map((c) => ({ value: c, label: c }))]}
            />
            <TextInput label={t('products.field.brand')} value={draft.brand} onChange={(e) => set('brand', e.target.value)} />
            <SelectInput
              label={t('common.status')}
              value={draft.status}
              onChange={(e) => set('status', e.target.value as Product['status'])}
              options={[
                { value: 'active', label: t('status.active') },
                { value: 'inactive', label: t('status.inactive') },
                { value: 'draft', label: t('status.draft') },
                { value: 'archived', label: t('status.archived') },
              ]}
            />
            <TextInput
              label={t('products.field.tags')}
              value={draft.tags.join(', ')}
              help={t('common.optional')}
              onChange={(e) => set('tags', e.target.value.split(',').map((x) => x.trim()).filter(Boolean))}
            />
          </div>
        </section>

        <section className="form-section">
          <div className="form-section__head">{t('products.section.pricing')}</div>
          <div className="form-section__body">
            <TextInput label={t('products.field.sellingPrice')} money required value={major(draft.sellingPrice)} error={errors.sellingPrice} onChange={(e) => set('sellingPrice', onMoney(e.target.value))} />
            <TextInput label={t('products.field.buyingPrice')} money value={major(draft.buyingPrice)} error={errors.buyingPrice} onChange={(e) => set('buyingPrice', onMoney(e.target.value))} />
            <TextInput label={t('products.field.compareAtPrice')} money value={major(draft.compareAtPrice)} onChange={(e) => set('compareAtPrice', onMoney(e.target.value))} />
            <TextInput label={t('products.field.minSellingPrice')} money value={major(draft.minSellingPrice)} onChange={(e) => set('minSellingPrice', onMoney(e.target.value))} />
            <TextInput label={t('products.field.targetMargin')} value={String(draft.targetMarginPct)} onChange={(e) => set('targetMarginPct', Number(e.target.value) || 0)} />
            <TextInput label={t('products.field.targetProfit')} money value={major(draft.targetProfit)} onChange={(e) => set('targetProfit', onMoney(e.target.value))} />
          </div>
          <div className="card__body">
            <KeyValue
              tight
              rows={[
                { label: t('products.cost.landed'), value: fmt.money(landed) },
                { label: t('products.cost.trueUnit'), value: fmt.money(trueCost) },
                { label: t('common.profit'), value: fmt.money(grossProfit), tone: grossProfit >= 0 ? 'positive' : 'negative' },
                { label: t('common.margin'), value: fmt.pct(margin), divider: true },
              ]}
            />
            <p className="field__help mt-2">{t('products.help.trueUnitCost')}</p>
            {margin !== null && draft.targetMarginPct > 0 && margin < draft.targetMarginPct && (
              <Chip tone="warning" dot>
                {t('products.underTargetMargin')}
              </Chip>
            )}
          </div>
        </section>

        <section className="form-section">
          <div className="form-section__head">{t('products.section.cost')}</div>
          <div className="form-section__body">
            <SelectInput
              label={t('products.field.costBasis')}
              value={draft.costBasis}
              onChange={(e) => set('costBasis', e.target.value as Product['costBasis'])}
              options={[
                { value: 'perUnit', label: t('products.costBasis.perUnit') },
                { value: 'batch', label: t('products.costBasis.batch') },
                { value: 'percentOfBuying', label: t('products.costBasis.percentOfBuying') },
              ]}
            />
            {draft.costBasis === 'batch' && (
              <TextInput label={t('products.field.batchQty')} value={String(draft.batchQty)} onChange={(e) => set('batchQty', Number(e.target.value) || 1)} />
            )}
            {DIRECT_COST_KEYS.map((key) => (
              <TextInput
                key={key}
                label={t(`products.cost.${key}`)}
                money
                value={String(draft.costs[key])}
                onChange={(e) => setCost(key, Number(e.target.value) || 0)}
                help={draft.costBasis === 'percentOfBuying' ? '%' : undefined}
              />
            ))}
          </div>
          <div className="card__body">
            <KeyValue
              tight
              rows={[
                ...costBreakdown(draft).map((c) => ({
                  label: t(`products.cost.${c.label}`),
                  value: fmt.money(c.amount),
                })),
                { label: t('products.cost.trueUnit'), value: fmt.money(trueCost), total: true, divider: true },
              ]}
            />
            <p className="tiny muted mt-2">
              {t('products.cost.landed')}: {fmt.money(landed)} · {t('common.perUnit')} {fmt.money(directPerUnit)}
            </p>
          </div>
        </section>

        <section className="form-section">
          <div className="form-section__head">{t('products.section.inventory')}</div>
          <div className="form-section__body">
            {isNew ? (
              <TextInput
                label={t('products.field.openingStock')}
                value={String(opening)}
                help={t('products.help.openingStock')}
                onChange={(e) => setOpening(Number(e.target.value) || 0)}
              />
            ) : (
              <Field label={t('inventory.onHand')}>
                <div className="input" style={{ display: 'flex', alignItems: 'center' }}>
                  {fmt.num(existingStock ?? 0)}
                </div>
              </Field>
            )}
            <TextInput label={t('products.field.reorderLevel')} value={String(draft.reorderLevel)} onChange={(e) => set('reorderLevel', Number(e.target.value) || 0)} />
            <TextInput label={t('products.field.reorderQuantity')} value={String(draft.reorderQuantity)} onChange={(e) => set('reorderQuantity', Number(e.target.value) || 0)} />
            <TextInput label={t('products.field.safetyStock')} value={String(draft.safetyStock)} onChange={(e) => set('safetyStock', Number(e.target.value) || 0)} />
          </div>
        </section>

        <section className="form-section">
          <div className="form-section__head">{t('products.section.logistics')}</div>
          <div className="form-section__body">
            <TextInput label={t('products.field.weight')} value={String(draft.weightKg)} onChange={(e) => set('weightKg', Number(e.target.value) || 0)} />
            <TextInput label={t('products.field.packageWeight')} value={String(draft.packageWeightKg)} onChange={(e) => set('packageWeightKg', Number(e.target.value) || 0)} />
            <TextInput label={t('products.field.length')} value={String(draft.lengthCm)} onChange={(e) => set('lengthCm', Number(e.target.value) || 0)} />
            <TextInput label={t('products.field.width')} value={String(draft.widthCm)} onChange={(e) => set('widthCm', Number(e.target.value) || 0)} />
            <TextInput label={t('products.field.height')} value={String(draft.heightCm)} onChange={(e) => set('heightCm', Number(e.target.value) || 0)} />
          </div>
        </section>

        <section className="form-section">
          <div className="form-section__head">{t('products.section.supplier')}</div>
          <div className="form-section__body">
            <SelectInput
              label={t('nav.suppliers')}
              value={draft.supplierId ?? ''}
              onChange={(e) => set('supplierId', e.target.value || null)}
              options={[{ value: '', label: '—' }, ...(data?.suppliers ?? []).map((s) => ({ value: s.id, label: s.name }))]}
            />
          </div>
        </section>

        <section className="form-section">
          <div className="form-section__head">{t('products.section.notes')}</div>
          <div className="form-section__body form-section__body--single">
            <TextInput label={t('products.field.description')} value={draft.description} onChange={(e) => set('description', e.target.value)} />
            <Field label={t('common.notes')}>
              <textarea className="textarea" value={draft.notes} onChange={(e) => set('notes', e.target.value)} />
            </Field>
          </div>
        </section>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ *
 * Product detail
 * ------------------------------------------------------------------ */

export function ProductDetailPage() {
  const { id } = useParams();
  const { t } = useI18n();
  const fmt = useFmt();
  const { data, analytics, run } = useWorkspace();
  const navigate = useNavigate();
  const [tab, setTab] = useState('overview');
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const toast = useToast();

  const product = data?.products.find((p) => p.id === id);
  const row = analytics?.products.find((p) => p.product.id === id);
  const inv = analytics?.inventory.rows.find((r) => r.product.id === id);

  if (!product || !row || !analytics || !inv) {
    return (
      <Card>
        <EmptyState title={t('error.notFound.title')} body={t('error.notFound.body')} action={<Button onClick={() => navigate('/products')}>{t('common.back')}</Button>} />
      </Card>
    );
  }

  const movements = (data?.movements ?? [])
    .filter((m) => m.productId === product.id)
    .sort((a, b) => (a.date < b.date ? 1 : -1));
  const orders = (analytics.period.orders ?? []).filter((o) =>
    analytics.period.orderItems.some((i) => i.orderId === o.id && i.productId === product.id),
  );
  const adRows = analytics.period.adRows.filter((r) => r.productId === product.id || r.sku === product.sku);
  const supplier = data?.suppliers.find((s) => s.id === product.supplierId);
  const audit = (data?.business ? [] : []).concat([]);
  void audit;

  return (
    <>
      <PageHeader
        title={product.name}
        subtitle={`${product.sku} · ${product.category || '—'} · ${product.brand || '—'}`}
        actions={
          <>
            <Button variant="secondary" onClick={() => setEditing(true)}>
              {t('action.edit')}
            </Button>
            <Button variant="danger-quiet" onClick={() => setConfirmDelete(true)}>
              {t('action.delete')}
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
          { label: t('kpi.revenue'), value: fmt.money(row.revenue) },
          { label: t('common.units'), value: fmt.num(row.units) },
          { label: t('products.cost.trueUnit'), value: fmt.money(row.trueUnitCost) },
          { label: t('kpi.grossProfit'), value: fmt.money(row.grossProfit), tone: row.grossProfit >= 0 ? ('positive' as const) : ('negative' as const) },
          { label: t('kpi.grossMargin'), value: fmt.pct(row.grossMarginPct) },
          { label: t('kpi.contributionProfit'), value: fmt.money(row.contributionProfit), tone: row.contributionProfit >= 0 ? ('positive' as const) : ('negative' as const) },
          { label: t('products.profitPerUnit'), value: fmt.money(row.profitPerUnit) },
          { label: t('kpi.adSpend'), value: fmt.money(row.adSpend) },
          { label: t('ads.roas'), value: fmt.multiple(row.roas) },
          { label: t('kpi.breakEvenRoas'), value: fmt.multiple(row.breakEvenRoasValue) },
          { label: t('inventory.onHand'), value: fmt.num(inv.onHand) },
          { label: t('kpi.returnRate'), value: fmt.pct(row.returnRatePct) },
        ].map((k) => (
          <div className="metric" key={k.label}>
            <span className="metric__label">{k.label}</span>
            <span className={`metric__value metric__value--sm ${k.tone === 'positive' ? 'money-positive' : k.tone === 'negative' ? 'money-negative' : ''}`}>{k.value}</span>
          </div>
        ))}
      </div>

      <Card className="mb-5" flush>
        <div className="card__body" style={{ paddingBottom: 0 }}>
          <div className="tabs" role="tablist" aria-label={t('common.details')}>
            {(['overview', 'inventory', 'sales', 'profitability', 'costBreakdown', 'orders', 'advertising', 'supplier'] as const).map((key) => (
              <button key={key} type="button" role="tab" className="tab" aria-selected={tab === key} onClick={() => setTab(key)}>
                {t(`products.tab.${key}`)}
              </button>
            ))}
          </div>
        </div>
        <div className="card__body">
          {tab === 'overview' && (
            <div className="grid grid--2">
              <KeyValue
                rows={[
                  { label: t('products.field.sku'), value: product.sku },
                  { label: t('common.category'), value: product.category || '—' },
                  { label: t('products.field.brand'), value: product.brand || '—' },
                  { label: t('common.status'), value: t(`status.${product.status}`) },
                  { label: t('products.field.sellingPrice'), value: fmt.money(product.sellingPrice) },
                  { label: t('products.cost.trueUnit'), value: fmt.money(row.trueUnitCost) },
                  { label: t('products.field.targetMargin'), value: fmt.pct(product.targetMarginPct, 0) },
                ]}
              />
              <KeyValue
                rows={[
                  { label: t('inventory.onHand'), value: fmt.num(inv.onHand) },
                  { label: t('inventory.reserved'), value: fmt.num(inv.reserved) },
                  { label: t('inventory.available'), value: fmt.num(inv.available) },
                  { label: t('inventory.value'), value: fmt.money(inv.value) },
                  { label: t('inventory.turnover'), value: inv.turnover === null ? '—' : fmt.num(inv.turnover, 2) },
                  { label: t('inventory.daysOfStock'), value: inv.daysLeft === null ? '—' : fmt.num(inv.daysLeft, 0) },
                  { label: t('inventory.lastSale'), value: inv.lastSaleDate ? fmt.date(inv.lastSaleDate) : '—' },
                ]}
              />
            </div>
          )}

          {tab === 'inventory' && (
            <DataTable
              columns={[
                { key: 'date', label: t('common.date'), render: (m: (typeof movements)[number]) => fmt.date(m.date), sortValue: (m) => m.date },
                { key: 'type', label: t('common.type'), render: (m) => t(`inventory.movement.${m.type}`), sortValue: (m) => m.type },
                { key: 'qty', label: t('common.qty'), numeric: true, render: (m) => fmt.num(m.qty), sortValue: (m) => m.qty },
                { key: 'cost', label: t('common.cost'), numeric: true, render: (m) => (m.unitCost === null ? '—' : fmt.money(m.unitCost)), sortValue: (m) => m.unitCost ?? 0, hideOnMobile: true },
                { key: 'note', label: t('common.notes'), render: (m) => m.note || '—', sortValue: (m) => m.note },
              ]}
              rows={movements}
              rowKey={(m) => m.id}
              empty={<EmptyState title={t('empty.inventory.title')} body={t('empty.inventory.body')} />}
            />
          )}

          {tab === 'sales' && (
            <div className="grid grid--2">
              <HorizontalBarChart
                data={analytics.trend.map((p) => ({ label: fmt.shortDate(p.date), value: 0, id: p.date }))}
                lang={fmt.lang}
                currency={fmt.currency}
                format="number"
              />
              <KeyValue
                rows={[
                  { label: t('kpi.orders'), value: fmt.num(row.orders) },
                  { label: t('common.units'), value: fmt.num(row.units) },
                  { label: t('kpi.revenue'), value: fmt.money(row.revenue) },
                  { label: t('kpi.aov'), value: row.orders > 0 ? fmt.money(Math.round(row.netRevenue / row.orders)) : '—' },
                ]}
              />
            </div>
          )}

          {tab === 'profitability' && (
            <div className="grid grid--2">
              <KeyValue
                rows={[
                  { label: t('products.field.sellingPrice'), value: fmt.money(product.sellingPrice) },
                  { label: t('products.cost.trueUnit'), value: fmt.money(row.trueUnitCost) },
                  { label: t('kpi.grossProfit'), value: fmt.money(row.grossProfit) },
                  { label: t('kpi.grossMargin'), value: fmt.pct(row.grossMarginPct) },
                  { label: t('kpi.adSpend'), value: fmt.money(row.adSpend) },
                  { label: t('finance.courier'), value: fmt.money(row.courier) },
                  { label: t('finance.packaging'), value: fmt.money(row.packaging) },
                  { label: t('kpi.returnRate'), value: fmt.pct(row.returnRatePct) },
                  { label: t('finance.returnsCost'), value: fmt.money(row.returnCost) },
                  { label: t('kpi.contributionProfit'), value: fmt.money(row.contributionProfit), divider: true, tone: row.contributionProfit >= 0 ? 'positive' : 'negative' },
                  { label: t('kpi.netMargin'), value: fmt.pct(row.netMarginPct) },
                  { label: t('products.profitPerUnit'), value: fmt.money(row.profitPerUnit) },
                ]}
              />
              <div className="stack">
                <div>
                  <div className="row--between row" style={{ marginBottom: 4 }}>
                    <span className="small">{t('kpi.grossMargin')}</span>
                    <span className="num small">{fmt.pct(row.grossMarginPct)}</span>
                  </div>
                  <Bar value={Math.max(0, Math.min(100, (row.grossMarginPct ?? 0)))} tone={(row.grossMarginPct ?? 0) >= 30 ? 'success' : 'warning'} />
                </div>
                <div>
                  <div className="row--between row" style={{ marginBottom: 4 }}>
                    <span className="small">{t('kpi.contributionMargin')}</span>
                    <span className="num small">{fmt.pct(row.netMarginPct)}</span>
                  </div>
                  <Bar value={Math.max(0, Math.min(100, (row.netMarginPct ?? 0)))} tone={(row.netMarginPct ?? 0) >= 15 ? 'success' : 'warning'} />
                </div>
                <p className="tiny muted">
                  {t('ads.roas')}: {fmt.multiple(row.roas)} · {t('kpi.breakEvenRoas')}: {fmt.multiple(row.breakEvenRoasValue)}
                </p>
                {row.breakEvenRoasValue === null && row.adSpend > 0 && <p className="tiny muted">{t('ads.breakEvenRoasNone')}</p>}
              </div>
            </div>
          )}

          {tab === 'costBreakdown' && (
            <div className="grid grid--2">
              <KeyValue
                rows={[
                  ...costBreakdown(product).map((c) => ({ label: t(`products.cost.${c.label}`), value: fmt.money(c.amount) })),
                  { label: t('products.cost.trueUnit'), value: fmt.money(row.trueUnitCost), total: true, divider: true },
                ]}
              />
              <KeyValue
                rows={[
                  { label: t('products.costBasis.perUnit'), value: t(`products.costBasis.${product.costBasis}`) },
                  { label: t('common.perUnit'), value: fmt.money(directCostPerUnit(product)) },
                  { label: t('products.cost.landed'), value: fmt.money(landedCost(product)) },
                  { label: t('kpi.cogs'), value: fmt.money(row.cogs), divider: true },
                  { label: t('common.units'), value: fmt.num(row.units) },
                ]}
              />
            </div>
          )}

          {tab === 'orders' && (
            <DataTable
              columns={[
                { key: 'no', label: t('orders.orderNo'), render: (o: (typeof orders)[number]) => <Link to={`/orders/${o.id}`}>{o.orderNo}</Link>, sortValue: (o) => o.orderNo },
                { key: 'date', label: t('common.date'), render: (o) => fmt.date(o.date), sortValue: (o) => o.date },
                { key: 'status', label: t('common.status'), render: (o) => <Chip tone="outline">{t(`status.${o.status}`)}</Chip>, sortValue: (o) => o.status },
                { key: 'ch', label: t('orders.channel'), render: (o) => o.channel, sortValue: (o) => o.channel },
              ]}
              rows={orders}
              rowKey={(o) => o.id}
              empty={<EmptyState title={t('empty.orders.title')} body={t('empty.orders.body')} />}
            />
          )}

          {tab === 'advertising' && (
            <DataTable
              columns={[
                { key: 'date', label: t('common.date'), render: (r: (typeof adRows)[number]) => fmt.date(r.date), sortValue: (r) => r.date },
                { key: 'camp', label: t('ads.campaign'), render: (r) => r.campaign || '—', sortValue: (r) => r.campaign },
                { key: 'spend', label: t('ads.spend'), numeric: true, render: (r) => fmt.money(r.spend), sortValue: (r) => r.spend },
                { key: 'rev', label: t('ads.revenue'), numeric: true, render: (r) => fmt.money(r.revenue), sortValue: (r) => r.revenue },
                { key: 'p', label: t('ads.purchases'), numeric: true, render: (r) => fmt.num(r.purchases), sortValue: (r) => r.purchases },
              ]}
              rows={adRows}
              rowKey={(r) => r.id}
              empty={<EmptyState title={t('empty.ads.title')} body={t('empty.ads.body')} />}
            />
          )}

          {tab === 'supplier' &&
            (supplier ? (
              <KeyValue
                rows={[
                  { label: t('common.name'), value: supplier.name },
                  { label: t('common.phone'), value: supplier.phone || '—' },
                  { label: t('common.email'), value: supplier.email || '—' },
                  { label: t('common.address'), value: supplier.address || '—' },
                ]}
              />
            ) : (
              <EmptyState title={t('empty.suppliers.title')} body={t('empty.suppliers.body')} />
            ))}
        </div>
      </Card>

      {editing && (
        <ProductForm
          product={product}
          openingStock={null}
          onClose={() => setEditing(false)}
          onSave={async (p) => {
            await run(() => saveProduct(p, null));
            setEditing(false);
            toast.push(t('app.saved'), 'success');
          }}
        />
      )}

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={async () => {
          await run(() => deleteProduct(product.id));
          setConfirmDelete(false);
          toast.push(t('data.resetDone'), 'success');
          navigate('/products');
        }}
        title={t('products.deleteConfirm')}
        body={t('data.consequences')}
        confirmLabel={t('action.delete')}
        cancelLabel={t('action.cancel')}
        typedPhrase="DELETE"
        typePrompt={t('data.typeToConfirm', { phrase: 'DELETE' })}
      />
    </>
  );
}
