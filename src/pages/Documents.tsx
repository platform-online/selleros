import { useState } from 'react';
import { useI18n } from '../i18n';
import { useWorkspace } from '../state/workspace';
import { useFmt } from '../state/format';
import { PageHeader } from '../components/layout/PageHeader';
import { Button, Card, EmptyState, Field, SelectInput, useToast } from '../components/ui/primitives';
import {
  buildOrderDocument,
  buildStatement,
  ORDER_DOCS,
  type DocType,
  type DocumentModel,
} from '../domain/documents';
import { downloadText } from '../lib/csv';
import { sum } from '../lib/money';
import { IconDownload, IconPrinter, IconShare } from '../components/ui/icons';

export function DocumentsPage() {
  const { t } = useI18n();
  const fmt = useFmt();
  const { data, business, analytics, loading, today } = useWorkspace();
  const toast = useToast();

  const [kind, setKind] = useState<'order' | 'customerStatement' | 'supplierStatement'>('order');
  const [docType, setDocType] = useState<DocType>('invoice');
  const [orderId, setOrderId] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [model, setModel] = useState<DocumentModel | null>(null);

  if (loading || !data || !business || !analytics) {
    return <Card><p className="muted small">{t('common.loading')}</p></Card>;
  }

  const orders = [...data.orders].sort((a, b) => (a.date < b.date ? 1 : -1));
  const products = new Map(data.products.map((p) => [p.id, p]));

  const generate = () => {
    if (kind === 'order') {
      const order = data.orders.find((o) => o.id === orderId);
      if (!order) {
        toast.push(t('error.validation'), 'danger');
        return;
      }
      const items = data.orderItems.filter((i) => i.orderId === order.id);
      const paid = sum(data.payments.filter((p) => p.orderId === order.id && p.type === 'in').map((p) => p.amount));
      setModel(
        buildOrderDocument({
          type: docType,
          business,
          order,
          items,
          products,
          customer: data.customers.find((c) => c.id === order.customerId) ?? null,
          courier: data.couriers.find((c) => c.id === order.courierId) ?? null,
          paid,
          today,
        }),
      );
    } else if (kind === 'customerStatement') {
      const customer = data.customers.find((c) => c.id === customerId);
      if (!customer) {
        toast.push(t('error.validation'), 'danger');
        return;
      }
      const rows = orders
        .filter((o) => o.customerId === customer.id)
        .map((o) => {
          const total = sum(data.orderItems.filter((i) => i.orderId === o.id).map((i) => i.unitPrice * i.qty));
          const paid = sum(data.payments.filter((p) => p.orderId === o.id && p.type === 'in').map((p) => p.amount));
          return { date: o.date, label: `${t('docs.invoice')} ${o.orderNo}`, debit: total, credit: paid };
        });
      setModel(
        buildStatement({
          kind: 'customer',
          business,
          party: { name: customer.name, lines: [customer.address, customer.city, customer.phone].filter(Boolean) },
          rows,
          opening: 0,
          today,
          periodLabel: `${fmt.shortDate(analytics.range.start)} – ${fmt.shortDate(analytics.range.end)}`,
        }),
      );
    } else {
      const supplier = data.suppliers.find((s) => s.id === supplierId);
      if (!supplier) {
        toast.push(t('error.validation'), 'danger');
        return;
      }
      const rows = data.purchases
        .filter((p) => p.supplierId === supplier.id)
        .map((p) => {
          const goods = sum(data.purchaseItems.filter((i) => i.purchaseId === p.id).map((i) => i.buyingPrice * i.receivedQty));
          const paid = sum(p.payments.map((x) => x.amount));
          return { date: p.date, label: `${t('docs.purchase')} ${p.ref}`, debit: paid, credit: goods };
        });
      setModel(
        buildStatement({
          kind: 'supplier',
          business,
          party: { name: supplier.name, lines: [supplier.address, supplier.phone].filter(Boolean) },
          rows,
          opening: 0,
          today,
          periodLabel: `${fmt.shortDate(analytics.range.start)} – ${fmt.shortDate(analytics.range.end)}`,
        }),
      );
    }
  };

  const share = async () => {
    if (!model) return;
    const text = docToText(model, fmt);
    if (navigator.share) {
      // Opens the device share sheet. SellerOS itself never sends anything.
      try {
        await navigator.share({ title: `${model.title} ${model.docNo}`, text });
      } catch {
        /* user dismissed the share sheet */
      }
    } else {
      await navigator.clipboard?.writeText(text);
      toast.push(t('docs.copied'), 'success');
    }
  };

  return (
    <>
      <PageHeader title={t('docs.title')} subtitle={t('docs.subtitle')} />

      <div className="grid grid--docs">
        <Card title={t('docs.create')} flush>
          <div className="card__body stack">
            <Field label={t('docs.kind')}>
              <SelectInput
                value={kind}
                onChange={(e) => {
                  setKind(e.target.value as typeof kind);
                  setModel(null);
                }}
                options={[
                  { value: 'order', label: t('docs.kindOrder') },
                  { value: 'customerStatement', label: t('docs.customerStatement') },
                  { value: 'supplierStatement', label: t('docs.supplierStatement') },
                ]}
              />
            </Field>

            {kind === 'order' && (
              <>
                <Field label={t('docs.docType')}>
                  <SelectInput value={docType} onChange={(e) => setDocType(e.target.value as DocType)} options={ORDER_DOCS.map((d) => ({ value: d, label: t(`docs.type.${d}`) }))} />
                </Field>
                <Field label={t('docs.order')}>
                  <SelectInput value={orderId} onChange={(e) => setOrderId(e.target.value)} options={[{ value: '', label: t('docs.selectOrder') }, ...orders.map((o) => ({ value: o.id, label: `${o.orderNo} · ${fmt.shortDate(o.date)}` }))]} />
                </Field>
              </>
            )}
            {kind === 'customerStatement' && (
              <Field label={t('nav.customers')}>
                <SelectInput value={customerId} onChange={(e) => setCustomerId(e.target.value)} options={[{ value: '', label: t('docs.selectCustomer') }, ...data.customers.map((c) => ({ value: c.id, label: c.name }))]} />
              </Field>
            )}
            {kind === 'supplierStatement' && (
              <Field label={t('nav.suppliers')}>
                <SelectInput value={supplierId} onChange={(e) => setSupplierId(e.target.value)} options={[{ value: '', label: t('docs.selectSupplier') }, ...data.suppliers.map((s) => ({ value: s.id, label: s.name }))]} />
              </Field>
            )}

            <Button variant="primary" onClick={generate}>
              {t('docs.generate')}
            </Button>

            <Card className="panel">
              <p className="tiny muted">{t('docs.honestShare')}</p>
            </Card>
          </div>
        </Card>

        <Card title={t('docs.preview')} flush>
          {model === null ? (
            <div className="card__body">
              <EmptyState icon={<IconPrinter size={20} />} title={t('docs.empty')} body={t('docs.emptyBody')} />
            </div>
          ) : (
            <>
              <div className="card__body row gap-2 doc-toolbar">
                <Button variant="primary" icon={<IconPrinter size={15} />} onClick={() => window.print()}>
                  {t('docs.print')}
                </Button>
                <Button variant="secondary" icon={<IconDownload size={15} />} onClick={() => downloadText(`${model.docNo}.html`, docToHtml(model, fmt), 'text/html;charset=utf-8')}>
                  {t('docs.downloadHtml')}
                </Button>
                <Button variant="secondary" icon={<IconShare size={15} />} onClick={share}>
                  {t('docs.share')}
                </Button>
              </div>
              <div className="doc" lang={fmt.lang === 'bn' ? 'bn' : 'en'}>
                <DocView model={model} fmt={fmt} />
              </div>
            </>
          )}
        </Card>
      </div>
    </>
  );
}

function DocView({ model, fmt }: { model: DocumentModel; fmt: ReturnType<typeof useFmt> }) {
  const { t } = useI18n();
  return (
    <div className="doc__page">
      <header className="doc__head">
        <div>
          <div className="doc__brand">{model.from.name}</div>
          {model.from.lines.map((l) => (
            <div key={l} className="doc__muted">{l}</div>
          ))}
        </div>
        <div className="doc__titlebox">
          <div className="doc__title">{model.title}</div>
          <div className="doc__no">{model.docNo}</div>
          <div className="doc__muted">{t('common.date')}: {fmt.date(model.issueDate)}</div>
          {model.reference && <div className="doc__muted">{t('docs.reference')}: {model.reference}</div>}
        </div>
      </header>

      {model.meta.length > 0 && (
        <div className="doc__meta">
          {model.meta.map((m) => (
            <div key={m.label}><span className="doc__muted">{m.label}:</span> {m.value}</div>
          ))}
        </div>
      )}

      <div className="doc__parties">
        <div>
          <div className="doc__label">{t('docs.to')}</div>
          <div className="doc__strong">{model.to.name}</div>
          {model.to.lines.map((l) => (
            <div key={l} className="doc__muted">{l}</div>
          ))}
        </div>
      </div>

      {model.lines.length > 0 && (
        <table className="doc__table">
          <thead>
            <tr>
              <th>{t('common.description')}</th>
              <th className="num">{t('common.units')}</th>
              <th className="num">{t('docs.unitPrice')}</th>
              <th className="num">{t('common.amount')}</th>
            </tr>
          </thead>
          <tbody>
            {model.lines.map((l, i) => (
              <tr key={i}>
                <td>{l.label}</td>
                <td className="num">{l.qty ?? '—'}</td>
                <td className="num">{l.unit === null ? '—' : fmt.money(l.unit)}</td>
                <td className="num">{l.amount === 0 && l.unit === null ? '—' : fmt.money(l.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {model.totals.length > 0 && (
        <div className="doc__totals">
          {model.totals.map((tot) => (
            <div key={tot.label} className={`doc__totalrow ${tot.strong ? 'doc__totalrow--strong' : ''}`}>
              <span>{tot.label}</span>
              <span className={tot.negative ? 'money-negative' : ''}>{fmt.money(tot.amount)}</span>
            </div>
          ))}
        </div>
      )}

      {model.balanceDue !== null && (
        <div className="doc__balance">
          {t('docs.balanceDue')}: <strong>{fmt.money(model.balanceDue)}</strong>
        </div>
      )}

      {model.notes.length > 0 && (
        <div className="doc__notes">
          {model.notes.map((n) => (
            <div key={n} className="doc__muted">{n}</div>
          ))}
        </div>
      )}
      {model.terms.length > 0 && (
        <div className="doc__notes">
          <div className="doc__label">{t('docs.terms')}</div>
          {model.terms.map((n) => (
            <div key={n} className="doc__muted">{n}</div>
          ))}
        </div>
      )}

      <footer className="doc__foot">
        <span>{t('docs.generatedBy')}</span>
      </footer>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Export helpers (honest: produce files / share-sheet, never claim to send)
 * ------------------------------------------------------------------ */

function docToText(model: DocumentModel, fmt: ReturnType<typeof useFmt>): string {
  const lines = [
    `${model.from.name}`,
    `${model.title} ${model.docNo}`,
    `${model.reference ?? ''}`,
    '',
    `${model.to.name}`,
    '',
    ...model.lines.map((l) => `${l.label}  x${l.qty ?? ''}  ${l.unit === null ? '' : fmt.money(l.unit)}  ${fmt.money(l.amount)}`),
    '',
    ...model.totals.map((t) => `${t.label}: ${fmt.money(t.amount)}`),
  ];
  return lines.join('\n');
}

function docToHtml(model: DocumentModel, fmt: ReturnType<typeof useFmt>): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(model.docNo)}</title>
<style>body{font-family:system-ui,sans-serif;padding:32px;color:#0f172a}table{width:100%;border-collapse:collapse}td,th{border-bottom:1px solid #e2e8f0;padding:6px;text-align:left}th{font-size:12px}.num{text-align:right}.strong{font-weight:700}.muted{color:#64748b;font-size:12px}</style>
</head><body>
<h2>${esc(model.from.name)}</h2>
<h1>${esc(model.title)} <span class="muted">${esc(model.docNo)}</span></h1>
<p class="muted">${esc(model.reference ?? '')}</p>
<p><strong>${esc(model.to.name)}</strong><br>${model.to.lines.map(esc).join('<br>')}</p>
<table><thead><tr><th>Description</th><th class="num">Qty</th><th class="num">Unit</th><th class="num">Amount</th></tr></thead><tbody>
${model.lines.map((l) => `<tr><td>${esc(l.label)}</td><td class="num">${l.qty ?? '—'}</td><td class="num">${l.unit === null ? '—' : fmt.money(l.unit)}</td><td class="num">${fmt.money(l.amount)}</td></tr>`).join('')}
</tbody></table>
<div>${model.totals.map((t) => `<p class="${t.strong ? 'strong' : ''}">${esc(t.label)}: ${fmt.money(t.amount)}</p>`).join('')}</div>
<p class="muted">${esc(model.notes.join(' '))}</p>
</body></html>`;
}
