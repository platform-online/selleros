import { add, roundMinor, sub, sum, type Money } from '../lib/money';
import type { Business, Courier, Customer, Order, OrderItem, Product, Purchase, PurchaseItem } from './types';

export type DocType =
  | 'invoice'
  | 'receipt'
  | 'quotation'
  | 'proforma'
  | 'deliveryNote'
  | 'packingSlip'
  | 'shippingLabel'
  | 'customerStatement'
  | 'supplierStatement'
  | 'creditNote'
  | 'debitNote';

export const ORDER_DOCS: DocType[] = [
  'invoice',
  'receipt',
  'quotation',
  'proforma',
  'deliveryNote',
  'packingSlip',
  'shippingLabel',
  'creditNote',
  'debitNote',
];

export interface DocParty {
  name: string;
  lines: string[];
}

export interface DocLine {
  label: string;
  qty: number | null;
  unit: Money | null;
  amount: Money;
}

export interface DocTotal {
  label: string;
  amount: Money;
  strong?: boolean;
  negative?: boolean;
}

export interface DocumentModel {
  type: DocType;
  title: string;
  docNo: string;
  issueDate: string;
  reference: string | null;
  from: DocParty;
  to: DocParty;
  lines: DocLine[];
  totals: DocTotal[];
  /** money the customer still owes (or supplier owes you), when relevant */
  balanceDue: Money | null;
  notes: string[];
  terms: string[];
  meta: { label: string; value: string }[];
}

export interface OrderDocInput {
  type: DocType;
  business: Business;
  order: Order;
  items: OrderItem[];
  products: Map<string, Product>;
  customer: Customer | null;
  courier: Courier | null;
  paid: Money;
  today: string;
}

const partyFromBusiness = (b: Business): DocParty => ({
  name: b.name,
  lines: [b.address, b.city, b.country, b.phone, b.email].filter(Boolean),
});

const partyFromCustomer = (c: Customer | null): DocParty =>
  c
    ? { name: c.name, lines: [c.address, c.city, c.phone, c.email].filter(Boolean) }
    : { name: 'Walk-in customer', lines: [] };

export function orderTotals(order: Order, items: OrderItem[]) {
  const gross = sum(items.map((i) => roundMinor(i.unitPrice * i.qty)));
  const lineDiscounts = sum(items.map((i) => i.discount ?? 0));
  const discounts = add(order.discount ?? 0, lineDiscounts);
  const shipping = order.shippingCharged ?? 0;
  const total = sub(gross, discounts) + shipping;
  return { gross, discounts, shipping, total };
}

/**
 * Build a printable document model. Pure — the UI only renders what this
 * returns, so every document reconciles with the same order economics used
 * everywhere else in the app.
 */
export function buildOrderDocument(input: OrderDocInput): DocumentModel {
  const { type, business, order, items, products, customer, courier, paid, today } = input;
  const { gross, discounts, shipping, total } = orderTotals(order, items);

  const lines: DocLine[] = items.map((i) => ({
    label: products.get(i.productId)?.name ?? `Item ${i.productId}`,
    qty: i.qty,
    unit: i.unitPrice,
    amount: sub(roundMinor(i.unitPrice * i.qty), i.discount ?? 0),
  }));

  const totals: DocTotal[] = [];
  const meta: { label: string; value: string }[] = [];
  let balanceDue: Money | null = null;
  let notes: string[] = [];
  const terms: string[] = [];

  const prefix = (p: string) => `${p}-${order.orderNo.replace(/^SO-?/, '')}`;

  switch (type) {
    case 'quotation':
      totals.push({ label: 'Subtotal', amount: gross });
      if (discounts > 0) totals.push({ label: 'Discount', amount: -discounts, negative: true });
      if (shipping > 0) totals.push({ label: 'Delivery', amount: shipping });
      totals.push({ label: 'Total (quoted)', amount: total, strong: true });
      notes = ['Prices are indicative and valid for 7 days.', 'This is a quotation, not a demand for payment.'];
      break;
    case 'proforma':
      totals.push({ label: 'Subtotal', amount: gross });
      if (discounts > 0) totals.push({ label: 'Discount', amount: -discounts, negative: true });
      if (shipping > 0) totals.push({ label: 'Delivery', amount: shipping });
      totals.push({ label: 'Total (proforma)', amount: total, strong: true });
      notes = ['Proforma invoice — issued before delivery to confirm the amount payable.'];
      break;
    case 'receipt':
      totals.push({ label: 'Amount received', amount: paid, strong: true });
      balanceDue = sub(total, paid);
      totals.push({ label: 'Balance', amount: balanceDue });
      meta.push({ label: 'Payment method', value: 'See payments' });
      notes = ['Thank you for your business.'];
      break;
    case 'deliveryNote':
    case 'packingSlip':
      // No prices on a packing slip; a delivery note may carry the total.
      if (type === 'deliveryNote') totals.push({ label: 'Order total', amount: total, strong: true });
      meta.push({ label: 'Courier', value: courier?.name ?? '—' });
      meta.push({ label: 'Tracking', value: order.trackingId || '—' });
      notes = type === 'packingSlip' ? ['Please check contents on receipt.'] : ['Received in good condition:'];
      break;
    case 'shippingLabel':
      meta.push({ label: 'Courier', value: courier?.name ?? '—' });
      meta.push({ label: 'Tracking', value: order.trackingId || '—' });
      meta.push({ label: 'COD amount', value: order.paymentStatus === 'paid' ? '0' : String(total) });
      break;
    case 'creditNote':
      totals.push({ label: 'Credit amount', amount: discounts > 0 ? discounts : total, strong: true, negative: true });
      notes = ['Credit issued against this order.'];
      break;
    case 'debitNote':
      totals.push({ label: 'Debit amount', amount: shipping, strong: true });
      notes = ['Debit issued against this order.'];
      break;
    case 'invoice':
    default:
      totals.push({ label: 'Subtotal', amount: gross });
      if (discounts > 0) totals.push({ label: 'Discount', amount: -discounts, negative: true });
      if (shipping > 0) totals.push({ label: 'Delivery', amount: shipping });
      totals.push({ label: 'Grand total', amount: total, strong: true });
      if (paid > 0) totals.push({ label: 'Paid', amount: paid, negative: true });
      balanceDue = sub(total, paid);
      totals.push({ label: 'Balance due', amount: balanceDue, strong: true });
      terms.push('Payment is due on delivery unless otherwise agreed.');
      break;
  }

  const docNoByType: Record<DocType, string> = {
    invoice: prefix('INV'),
    receipt: prefix('RCT'),
    quotation: prefix('QT'),
    proforma: prefix('PI'),
    deliveryNote: prefix('DN'),
    packingSlip: prefix('PS'),
    shippingLabel: prefix('SL'),
    customerStatement: prefix('ST'),
    supplierStatement: prefix('ST'),
    creditNote: prefix('CN'),
    debitNote: prefix('DB'),
  };

  return {
    type,
    title: DOC_TITLE[type],
    docNo: docNoByType[type],
    issueDate: today,
    reference: order.orderNo,
    from: partyFromBusiness(business),
    to: type === 'shippingLabel' || type === 'deliveryNote' || type === 'packingSlip' ? partyFromCustomer(customer) : partyFromCustomer(customer),
    lines: type === 'packingSlip' || type === 'shippingLabel' ? lines.map((l) => ({ ...l, unit: null, amount: 0 })) : lines,
    totals,
    balanceDue,
    notes,
    terms,
    meta,
  };
}

export interface StatementInput {
  kind: 'customer' | 'supplier';
  business: Business;
  party: { name: string; lines: string[] };
  rows: { date: string; label: string; debit: Money; credit: Money }[];
  opening: Money;
  today: string;
  periodLabel: string;
}

export function buildStatement(input: StatementInput): DocumentModel {
  const lines: DocLine[] = input.rows.map((r) => ({
    label: r.label,
    qty: null,
    unit: null,
    amount: sub(r.debit, r.credit),
  }));
  const totalDebit = sum(input.rows.map((r) => r.debit));
  const totalCredit = sum(input.rows.map((r) => r.credit));
  const closing = input.opening + totalDebit - totalCredit;

  return {
    type: input.kind === 'customer' ? 'customerStatement' : 'supplierStatement',
    title: input.kind === 'customer' ? 'Customer Statement' : 'Supplier Statement',
    docNo: `${input.kind === 'customer' ? 'CS' : 'SS'}-${input.today.replace(/-/g, '')}`,
    issueDate: input.today,
    reference: input.periodLabel,
    from: partyFromBusiness(input.business),
    to: input.party,
    lines,
    totals: [
      { label: 'Opening balance', amount: input.opening },
      { label: 'Debits', amount: totalDebit },
      { label: 'Credits', amount: -totalCredit, negative: true },
      { label: 'Closing balance', amount: closing, strong: true },
    ],
    balanceDue: closing,
    notes: ['Please notify us of any discrepancy within 7 days.'],
    terms: [],
    meta: [{ label: 'Period', value: input.periodLabel }],
  };
}

export const DOC_TITLE: Record<DocType, string> = {
  invoice: 'Invoice',
  receipt: 'Receipt',
  quotation: 'Quotation',
  proforma: 'Proforma Invoice',
  deliveryNote: 'Delivery Note',
  packingSlip: 'Packing Slip',
  shippingLabel: 'Shipping Label',
  customerStatement: 'Customer Statement',
  supplierStatement: 'Supplier Statement',
  creditNote: 'Credit Note',
  debitNote: 'Debit Note',
};

export type { Purchase, PurchaseItem };
