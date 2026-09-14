import { describe, expect, it } from 'vitest';
import { buildOrderDocument, orderTotals } from '../documents';
import { money } from '../../lib/money';
import type { Business, Order, OrderItem } from '../types';

const business: Business = {
  id: 'current',
  name: 'Test Shop',
  ownerName: 'Owner',
  phone: '',
  email: '',
  address: '',
  city: 'Dhaka',
  country: 'Bangladesh',
  currency: 'BDT',
  timezone: 'Asia/Dhaka',
  logo: null,
  website: '',
  facebook: '',
  instagram: '',
  tiktok: '',
  businessType: 'retail',
  createdAt: '',
};

const order: Order = {
  id: 'o1',
  orderNo: 'SO-101',
  date: '2026-09-01',
  customerId: null,
  channel: 'Facebook',
  courierId: null,
  trackingId: 'TRK1',
  notes: '',
  status: 'delivered',
  paymentStatus: 'partial',
  discount: money('100'),
  shippingCharged: money('60'),
  deliveryFee: 0,
  codFee: 0,
  packagingCost: 0,
  paymentFee: 0,
  otherCost: 0,
  adSpend: 0,
  attribution: { platform: '', campaign: '', adset: '', ad: '', creative: '', productId: null, source: '', medium: '', campaignId: '', method: 'manual' },
  createdAt: '',
  updatedAt: '',
};

const items: OrderItem[] = [
  { id: 'i1', orderId: 'o1', productId: 'p1', qty: 2, unitPrice: money('500'), discount: 0, unitCost: money('300') },
];

describe('documents', () => {
  it('order totals reconcile: gross − discounts + shipping', () => {
    const t = orderTotals(order, items);
    expect(t.gross).toBe(100000);
    expect(t.total).toBe(100000 - 10000 + 6000);
  });

  it('invoice shows balance due = total − paid', () => {
    const doc = buildOrderDocument({ type: 'invoice', business, order, items, products: new Map(), customer: null, courier: null, paid: money('500'), today: '2026-09-14' });
    expect(doc.title).toBe('Invoice');
    expect(doc.docNo).toContain('INV');
    expect(doc.balanceDue).toBe(96000 - 50000);
  });

  it('packing slip hides prices', () => {
    const doc = buildOrderDocument({ type: 'packingSlip', business, order, items, products: new Map(), customer: null, courier: null, paid: 0, today: '2026-09-14' });
    expect(doc.lines.every((l) => l.unit === null)).toBe(true);
    expect(doc.totals).toHaveLength(0);
  });
});
